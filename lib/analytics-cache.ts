
type CacheEntry = {
  data: unknown;
  ts: number;
  promise?: Promise<unknown>;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 60 seconds

export async function cachedFetch<T = unknown>(url: string): Promise<T> {
  const entry = cache.get(url);

  // Return cached data if still fresh
  if (entry && !entry.promise && Date.now() - entry.ts < CACHE_TTL) {
    return entry.data as T;
  }

  // Deduplicate concurrent in-flight requests
  if (entry?.promise) {
    return entry.promise as Promise<T>;
  }

  const promise = fetch(url, { cache: 'no-store' })
    .then(res => res.json())
    .then(data => {
      cache.set(url, { data, ts: Date.now() });
      return data;
    })
    .catch(err => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, { data: entry?.data ?? null, ts: entry?.ts ?? 0, promise });
  return promise as Promise<T>;
}

export function invalidateAnalyticsCache() {
  cache.clear();
}
