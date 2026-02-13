/**
 * Client-side signed URL cache and batch signer.
 * All components share a single in-memory cache so URLs are signed at most once.
 */

const _cache = new Map<string, string>();
let _pendingBatch: string[] = [];
let _batchTimer: ReturnType<typeof setTimeout> | null = null;
let _batchPromise: Promise<void> | null = null;
const _waiters = new Map<string, ((url: string) => void)[]>();

function isGcsUrl(url: string): boolean {
  return url.includes('storage.googleapis.com');
}

/**
 * Flush pending URLs — send them to the batch signing endpoint.
 */
async function flushBatch(): Promise<void> {
  const urls = [..._pendingBatch];
  _pendingBatch = [];
  _batchTimer = null;
  _batchPromise = null;

  if (urls.length === 0) return;

  try {
    const res = await fetch('/api/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!res.ok) throw new Error(`Sign failed: ${res.status}`);

    const { signed } = (await res.json()) as { signed: Record<string, string> };

    for (const [original, signedUrl] of Object.entries(signed)) {
      _cache.set(original, signedUrl);
      const waiters = _waiters.get(original);
      if (waiters) {
        for (const resolve of waiters) resolve(signedUrl);
        _waiters.delete(original);
      }
    }
  } catch (e) {
    console.error('[SignedUrl] Batch sign failed:', e);
    // Resolve waiters with original URLs so images still render
    for (const url of urls) {
      _cache.set(url, url);
      const waiters = _waiters.get(url);
      if (waiters) {
        for (const resolve of waiters) resolve(url);
        _waiters.delete(url);
      }
    }
  }
}

/**
 * Get a signed URL for a GCS URL. Returns from cache or queues for batch signing.
 * Non-GCS URLs are returned immediately.
 */
export function getSignedUrl(gcsUrl: string): string {
  if (!isGcsUrl(gcsUrl)) return gcsUrl;
  return _cache.get(gcsUrl) || gcsUrl;
}

/**
 * Sign a batch of GCS URLs at once. Returns a map of original → signed.
 * Uses the cache for already-signed URLs and batch-signs the rest.
 */
export async function signUrls(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toSign: string[] = [];

  for (const url of urls) {
    if (!isGcsUrl(url)) {
      result.set(url, url);
    } else if (_cache.has(url)) {
      result.set(url, _cache.get(url)!);
    } else {
      toSign.push(url);
    }
  }

  if (toSign.length === 0) return result;

  // Sign in chunks of 100
  for (let i = 0; i < toSign.length; i += 100) {
    const chunk = toSign.slice(i, i + 100);
    try {
      const res = await fetch('/api/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: chunk }),
      });
      if (!res.ok) throw new Error(`Sign failed: ${res.status}`);
      const { signed } = (await res.json()) as { signed: Record<string, string> };
      for (const [original, signedUrl] of Object.entries(signed)) {
        _cache.set(original, signedUrl);
        result.set(original, signedUrl);
      }
    } catch {
      // Fallback: use original URLs
      for (const url of chunk) {
        result.set(url, url);
      }
    }
  }

  return result;
}

/**
 * Clear the signed URL cache (e.g. when URLs expire).
 */
export function clearSignedUrlCache(): void {
  _cache.clear();
}
