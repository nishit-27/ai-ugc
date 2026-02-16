/**
 * Client-side signed URL cache.
 * Persists across reloads to avoid repeated signing for the same GCS object.
 */

type CacheEntry = {
  signedUrl: string;
  expiresAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'ai-ugc-signed-url-cache-v3';
const STORAGE_MAX_ENTRIES = 1000;
const EXPIRY_SAFETY_MS = 60_000;
const DEFAULT_SIGNED_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map<string, CacheEntry>();
const inflightByUrl = new Map<string, Promise<string>>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isGcsUrl(url: string): boolean {
  return typeof url === 'string' && url.includes('storage.googleapis.com');
}

function parseGoogDate(raw: string | null): number | null {
  if (!raw || raw.length < 16) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(9, 11));
  const minute = Number(raw.slice(11, 13));
  const second = Number(raw.slice(13, 15));

  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function parseSignedUrlExpiry(signedUrl: string): number {
  try {
    const parsed = new URL(signedUrl);
    const googDate = parseGoogDate(parsed.searchParams.get('X-Goog-Date'));
    const googExpiresRaw = parsed.searchParams.get('X-Goog-Expires');
    const googExpiresSec = googExpiresRaw ? Number(googExpiresRaw) : NaN;

    if (googDate && Number.isFinite(googExpiresSec) && googExpiresSec > 0) {
      return googDate + googExpiresSec * 1000;
    }
  } catch {
    // Ignore parse failures and use default TTL.
  }
  return Date.now() + DEFAULT_SIGNED_TTL_MS;
}

function isValidEntry(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && entry.expiresAt - EXPIRY_SAFETY_MS > Date.now();
}

function schedulePersist() {
  if (!isBrowser()) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const serialized = Array.from(cache.entries())
        .filter(([, entry]) => isValidEntry(entry))
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, STORAGE_MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch {
      // Ignore localStorage failures.
    }
  }, 50);
}

function hydrateCache() {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, CacheEntry]>;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length !== 2) continue;
      const [original, entry] = item;
      if (!isGcsUrl(original)) continue;
      if (!entry || typeof entry.signedUrl !== 'string' || typeof entry.expiresAt !== 'number') continue;
      if (isValidEntry(entry)) {
        cache.set(original, entry);
      }
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function setCacheEntry(originalUrl: string, signedUrl: string) {
  const now = Date.now();
  cache.set(originalUrl, {
    signedUrl,
    expiresAt: parseSignedUrlExpiry(signedUrl),
    updatedAt: now,
  });
  schedulePersist();
}

async function signChunk(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (urls.length === 0) return out;

  const response = await fetch('/api/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!response.ok) {
    throw new Error(`Sign failed: ${response.status}`);
  }

  const payload = (await response.json()) as { signed?: Record<string, string> };
  const signed = payload.signed || {};
  for (const url of urls) {
    const resolved = signed[url] || url;
    out.set(url, resolved);
    if (isGcsUrl(url) && resolved !== url) {
      setCacheEntry(url, resolved);
    }
  }
  return out;
}

/**
 * Returns cached signed URL immediately (or the original URL when not cached).
 */
export function getSignedUrl(gcsUrl: string): string {
  if (!isGcsUrl(gcsUrl)) return gcsUrl;
  hydrateCache();
  const entry = cache.get(gcsUrl);
  if (!isValidEntry(entry)) {
    if (entry) cache.delete(gcsUrl);
    return gcsUrl;
  }
  return entry.signedUrl;
}

/**
 * Sign a batch of URLs with aggressive dedupe + persistent caching.
 */
export async function signUrls(urls: string[]): Promise<Map<string, string>> {
  hydrateCache();
  const result = new Map<string, string>();
  const toSign = [...new Set(urls)].filter(Boolean);

  for (const url of toSign) {
    if (!isGcsUrl(url)) {
      result.set(url, url);
      continue;
    }
    const cached = cache.get(url);
    if (isValidEntry(cached)) {
      result.set(url, cached.signedUrl);
      continue;
    }
    if (cached) cache.delete(url);
  }

  const unsigned = toSign.filter((url) => isGcsUrl(url) && !result.has(url));
  if (unsigned.length === 0) return result;

  const immediateInflight: Promise<void>[] = [];
  const pendingForRequest: string[] = [];

  for (const url of unsigned) {
    const inflight = inflightByUrl.get(url);
    if (inflight) {
      immediateInflight.push(
        inflight
          .then((signed) => {
            result.set(url, signed);
          })
          .catch(() => {
            result.set(url, url);
          })
      );
      continue;
    }
    pendingForRequest.push(url);
  }

  for (let i = 0; i < pendingForRequest.length; i += 100) {
    const chunk = pendingForRequest.slice(i, i + 100);
    const chunkPromise = signChunk(chunk)
      .then((chunkResult) => {
        for (const [original, signed] of chunkResult.entries()) {
          result.set(original, signed);
        }
      })
      .catch(() => {
        for (const original of chunk) {
          result.set(original, original);
        }
      })
      .finally(() => {
        for (const original of chunk) {
          inflightByUrl.delete(original);
        }
      });

    for (const original of chunk) {
      inflightByUrl.set(
        original,
        chunkPromise.then(() => result.get(original) || original)
      );
    }
    immediateInflight.push(chunkPromise);
  }

  await Promise.all(immediateInflight);

  for (const url of toSign) {
    if (!result.has(url)) {
      result.set(url, url);
    }
  }

  return result;
}

export function clearSignedUrlCache(): void {
  cache.clear();
  inflightByUrl.clear();
  if (isBrowser()) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
