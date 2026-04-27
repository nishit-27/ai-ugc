import { config } from './config';
import { lateApiRequest, LateApiError } from './lateApi';
import { getProfileApiKey, getProfileCountPerKey } from './db-late-profile-keys';
import {
  getLearnedLimitsAll,
  setLearnedLimit,
} from './db-late-api-key-limits';

// Sentinel returned when we haven't learned a cap for this key yet — the
// balancer treats it as "limit unknown" and just routes by count until Late
// tells us we're full (we then learn the cap from that error).
export const UNKNOWN_LIMIT = Number.MAX_SAFE_INTEGER;

// Soft default kept for code that imports the constant directly. Not used by
// the balancer anymore — auto-detect handles it.
export const DEFAULT_MAX_PROFILES_PER_KEY = 50;
export const MAX_PROFILES_PER_KEY = DEFAULT_MAX_PROFILES_PER_KEY;

type EffectiveLimit = { max: number; source: 'learned' | 'unknown' };

// The cap is learned from the Late API: we persist it in `late_api_key_limits`
// when a profile add fails with a quota-shaped error, and bump it when an add
// succeeds past a previously learned cap. The legacy `LATE_API_KEY_LIMITS`
// env var is intentionally NOT consulted here — its values stick around and
// override real-world detection (which is exactly the bug we just fixed).
async function getEffectiveLimits(): Promise<Map<number, EffectiveLimit>> {
  const keys = config.LATE_API_KEYS;
  const learned = await getLearnedLimitsAll();
  const map = new Map<number, EffectiveLimit>();
  for (let i = 0; i < keys.length; i++) {
    if (learned.has(i)) {
      map.set(i, { max: learned.get(i)!, source: 'learned' });
    } else {
      map.set(i, { max: UNKNOWN_LIMIT, source: 'unknown' });
    }
  }
  return map;
}

export function getApiKeys(): string[] {
  return config.LATE_API_KEYS;
}

export function getApiKeyByIndex(index: number): string {
  const keys = config.LATE_API_KEYS;
  if (index < 0 || index >= keys.length) {
    throw new Error(`API key index ${index} out of range (0-${keys.length - 1})`);
  }
  return keys[index];
}

export async function getApiKeyForProfile(profileId: string): Promise<{ apiKey: string; apiKeyIndex: number } | null> {
  const index = await getProfileApiKey(profileId);
  if (index === null) return null;
  const keys = config.LATE_API_KEYS;
  if (index >= keys.length) return null;
  return { apiKey: keys[index], apiKeyIndex: index };
}

export async function getBalancedApiKeyIndex(): Promise<number> {
  const keys = config.LATE_API_KEYS;
  if (keys.length === 0) throw new Error('No GetLate API keys configured.');
  const counts = await getProfileCountPerKey();
  const limits = await getEffectiveLimits();
  let minIndex = -1;
  let minCount = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const count = counts.get(i) ?? 0;
    const max = limits.get(i)?.max ?? UNKNOWN_LIMIT;
    if (count < max && count < minCount) {
      minCount = count;
      minIndex = i;
    }
  }
  if (minIndex === -1) {
    throw new Error('All GetLate accounts are full. Add a new API key to LATE_API_KEYS.');
  }
  return minIndex;
}

export async function getKeyUsage(): Promise<
  { index: number; count: number; max: number; label: string; limitSource: 'learned' | 'unknown' }[]
> {
  const keys = config.LATE_API_KEYS;
  const counts = await getProfileCountPerKey();
  const limits = await getEffectiveLimits();
  return keys.map((_, i) => {
    const eff = limits.get(i) ?? { max: UNKNOWN_LIMIT, source: 'unknown' as const };
    return {
      index: i,
      count: counts.get(i) ?? 0,
      max: eff.max,
      label: getAccountLabel(i),
      limitSource: eff.source,
    };
  });
}

export async function fetchFromAllKeys<T>(
  endpoint: string,
  options: { method?: string; body?: string; timeout?: number; retries?: number } = {}
): Promise<{ apiKeyIndex: number; data: T }[]> {
  const keys = config.LATE_API_KEYS;
  const results = await Promise.allSettled(
    keys.map((apiKey, index) =>
      lateApiRequest<T>(endpoint, { ...options, apiKey }).then((data) => ({
        apiKeyIndex: index,
        data,
      }))
    )
  );
  const successes: { apiKeyIndex: number; data: T }[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    }
  }
  return successes;
}

export async function tryAllKeys<T>(
  endpoint: string,
  options: { method?: string; body?: string; timeout?: number; retries?: number } = {}
): Promise<{ apiKeyIndex: number; data: T }> {
  const keys = config.LATE_API_KEYS;
  let lastError: Error | null = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      const data = await lateApiRequest<T>(endpoint, { ...options, apiKey: keys[i] });
      return { apiKeyIndex: i, data };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError || new Error('All API keys failed');
}

export function getAccountLabel(index: number): string {
  return `GL-${index + 1}`;
}

// ── Auto-learning helpers ──

const QUOTA_HINT_PATTERNS = [
  /\blimit\b/i,
  /\bmax(imum)?\b/i,
  /\bquota\b/i,
  /\bplan\b/i,
  /\bsubscription\b/i,
  /\bupgrade\b/i,
  /\bcap\b/i,
  /\bexceed/i,
  /\bover (the )?limit\b/i,
];

function flattenErrorText(err: LateApiError): string {
  const parts: string[] = [err.message];
  if (typeof err.body === 'string') parts.push(err.body);
  else if (err.body && typeof err.body === 'object') {
    try {
      parts.push(JSON.stringify(err.body));
    } catch {
      // ignore
    }
  }
  return parts.join(' ');
}

// Decide whether a Late API error looks like "you've hit the profile cap on
// this plan" rather than a transient/unrelated failure.
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof LateApiError)) return false;
  // 402 Payment Required and 403 Forbidden are the typical billing/quota codes.
  // Some APIs use 429 too, but we only treat that as quota if the body hints at it.
  const text = flattenErrorText(err);
  if (err.status === 402) return true;
  if (err.status === 403 || err.status === 429 || err.status === 400) {
    return QUOTA_HINT_PATTERNS.some((re) => re.test(text));
  }
  return false;
}

// Called after a /profiles POST fails with a quota-shaped error: the count we
// observed at that moment IS the per-key cap. Persist it.
export async function learnLimitFromQuotaError(
  apiKeyIndex: number,
  observedCount: number,
): Promise<void> {
  const limit = Math.max(0, observedCount);
  await setLearnedLimit(apiKeyIndex, limit);
}

// Called after a /profiles POST succeeds: if we'd previously learned a smaller
// cap (e.g., user upgraded their Late plan), bump it up so we stop refusing
// adds preemptively.
export async function bumpLearnedLimitIfNeeded(
  apiKeyIndex: number,
  newCount: number,
): Promise<void> {
  const limits = await getLearnedLimitsAll();
  const current = limits.get(apiKeyIndex);
  if (current !== undefined && newCount > current) {
    await setLearnedLimit(apiKeyIndex, newCount);
  }
}
