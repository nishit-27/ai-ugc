import { config } from './config';
import { lateApiRequest } from './lateApi';
import { getProfileApiKey, getProfileCountPerKey } from './db-late-profile-keys';

export const MAX_PROFILES_PER_KEY = 50;

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
    if (count < MAX_PROFILES_PER_KEY && count < minCount) {
      minCount = count;
      minIndex = i;
    }
  }
  if (minIndex === -1) {
    throw new Error(`All GetLate accounts are full (${MAX_PROFILES_PER_KEY} profiles each). Add a new API key to LATE_API_KEYS.`);
  }
  return minIndex;
}

export async function getKeyUsage(): Promise<{ index: number; count: number; max: number; label: string }[]> {
  const keys = config.LATE_API_KEYS;
  const counts = await getProfileCountPerKey();
  return keys.map((_, i) => ({
    index: i,
    count: counts.get(i) ?? 0,
    max: MAX_PROFILES_PER_KEY,
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
