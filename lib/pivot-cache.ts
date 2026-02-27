// Server-side cache for pivot query results.
// Invalidated when analytics data changes (hard sync, account refresh, etc.)

type CacheEntry = {
  data: unknown;
  ts: number;
};

const cache = new Map<string, CacheEntry>();
let cacheVersion = 0;
let lastVersion = -1;

// Max age in ms — even without explicit invalidation, stale after 5 minutes
const MAX_AGE = 5 * 60 * 1000;

/**
 * Get cached pivot result for a given key.
 * Returns null if cache is stale or missing.
 */
export function getPivotCache(key: string): unknown | null {
  if (lastVersion !== cacheVersion) {
    // Version changed — clear all entries
    cache.clear();
    lastVersion = cacheVersion;
    return null;
  }
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store a pivot result in cache.
 */
export function setPivotCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
  lastVersion = cacheVersion;
}

/**
 * Invalidate all cached pivot data.
 * Call this after hard sync, account refresh, or any analytics data change.
 */
export function invalidatePivotCache(): void {
  cacheVersion++;
  cache.clear();
}
