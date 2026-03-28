import { config } from './config';
import { lateApiRequest } from './lateApi';
import { getProfileApiKey, getProfileCountPerKey } from './db-late-profile-keys';

export const DEFAULT_MAX_PROFILES_PER_KEY = 50;

// Allow per-key limits via LATE_API_KEY_LIMITS env var (comma-separated, e.g., "50,100,50")
function getMaxProfilesForKey(index: number): number {
  const raw = process.env.LATE_API_KEY_LIMITS;
  if (raw) {
    const limits = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (index < limits.length) return limits[index];
  }
  return DEFAULT_MAX_PROFILES_PER_KEY;
}

// Backwards compat — keep the constant for code that imports it directly
export const MAX_PROFILES_PER_KEY = DEFAULT_MAX_PROFILES_PER_KEY;

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
  if (keys.length <= 1) return 0;
  const counts = await getProfileCountPerKey();
  let minIndex = -1;
  let minCount = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const count = counts.get(i) ?? 0;
    const maxForKey = getMaxProfilesForKey(i);
    if (count < maxForKey && count < minCount) {
      minCount = count;
      minIndex = i;
    }
  }
  if (minIndex === -1) {
    throw new Error('All GetLate accounts are full. Add a new API key to LATE_API_KEYS.');
  }
  return minIndex;
}

export async function getKeyUsage(): Promise<{ index: number; count: number; max: number; label: string }[]> {
  const keys = config.LATE_API_KEYS;
  const counts = await getProfileCountPerKey();
  return keys.map((_, i) => ({
    index: i,
    count: counts.get(i) ?? 0,
    max: getMaxProfilesForKey(i),
    label: getAccountLabel(i),
  }));
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
