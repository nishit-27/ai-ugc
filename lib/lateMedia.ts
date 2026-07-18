import path from 'path';
import { lateApiRequest } from './lateApi';
import { getSignedUrlFromPublicUrl } from './storage';

// Uploads a source media URL into Zernio/Late storage and returns the
// `mediaItems` entry to attach to a post. Mirrors the proven flow in
// app/api/posts/upload/route.ts: presign → PUT bytes → reference publicUrl.
//
// Media must be re-hosted on the provider (rather than passing an external URL
// straight through) because each API key owns its own media namespace and the
// publish step expects provider-hosted URLs.

export type LateMediaItem = { type: 'image' | 'video'; url: string };

type PresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  key?: string;
  type?: string;
};

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

export function inferMediaType(url: string): 'image' | 'video' {
  const ext = path.extname(url.split('?')[0]).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'image';
}

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

// R2 URLs are public and fetchable directly; GCS public URLs need signing.
async function toFetchableUrl(sourceUrl: string): Promise<string> {
  if (sourceUrl.includes('.r2.dev/') || sourceUrl.includes('r2.cloudflarestorage.com')) {
    return sourceUrl;
  }
  if (sourceUrl.startsWith('https://storage.googleapis.com')) {
    return getSignedUrlFromPublicUrl(sourceUrl, 15);
  }
  return sourceUrl;
}

/**
 * Uploads a single source URL to Late/Zernio storage for one API key.
 * `cache` (keyed by `${apiKey}:${sourceUrl}`) avoids re-uploading the same
 * asset across multiple steps/accounts within one execution.
 */
export async function uploadMediaToLate(
  sourceUrl: string,
  apiKey: string,
  cache?: Map<string, LateMediaItem>
): Promise<LateMediaItem> {
  const cacheKey = `${apiKey}:${sourceUrl}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;

  const ext = path.extname(sourceUrl.split('?')[0]).toLowerCase() || '.jpg';
  const filename = path.basename(sourceUrl.split('?')[0]) || `media${ext}`;
  const contentType = contentTypeForExt(ext);
  const type = inferMediaType(sourceUrl);

  const presign = await lateApiRequest<PresignResponse>('/media/presign', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType }),
    apiKey,
  });

  const fetchable = await toFetchableUrl(sourceUrl);
  const download = await fetch(fetchable);
  if (!download.ok) {
    throw new Error(`Failed to download media ${sourceUrl}: ${download.status}`);
  }

  const contentLength = download.headers.get('Content-Length');
  let body: ReadableStream | Uint8Array;
  let uploadLength: string;
  if (contentLength && download.body) {
    body = download.body;
    uploadLength = contentLength;
  } else {
    const buf = await download.arrayBuffer();
    body = new Uint8Array(buf);
    uploadLength = String(buf.byteLength);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const upload = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': uploadLength },
      body: body as BodyInit,
      signal: controller.signal,
      ...({ duplex: 'half' } as Record<string, unknown>),
    });
    if (!upload.ok) {
      const errText = await upload.text().catch(() => '');
      throw new Error(`Media upload failed: ${upload.status} ${errText}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  const item: LateMediaItem = { type, url: presign.publicUrl };
  cache?.set(cacheKey, item);
  return item;
}

/** Uploads many source URLs for one API key, preserving order. */
export async function uploadMediaUrlsToLate(
  sourceUrls: string[],
  apiKey: string,
  cache?: Map<string, LateMediaItem>
): Promise<LateMediaItem[]> {
  const items: LateMediaItem[] = [];
  for (const url of sourceUrls) {
    if (!url) continue;
    items.push(await uploadMediaToLate(url, apiKey, cache));
  }
  return items;
}
