import { getSignedUrlFromPublicUrl } from '@/lib/storage';

const TTL = 6 * 24 * 60 * 60 * 1000; // 6 days (URLs are valid for 7 days)
const cache = new Map<string, { url: string; ts: number }>();

/**
 * Get a signed URL with in-memory caching.
 * Avoids redundant GCS calls on every poll.
 */
export async function getCachedSignedUrl(gcsUrl: string): Promise<string> {
  const entry = cache.get(gcsUrl);
  if (entry && Date.now() - entry.ts < TTL) {
    return entry.url;
  }
  const signed = await getSignedUrlFromPublicUrl(gcsUrl);
  cache.set(gcsUrl, { url: signed, ts: Date.now() });
  return signed;
}
