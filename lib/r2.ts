import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ai-ugc';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

/** Build a public URL for an object key */
export function getR2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

// ---------------------------------------------------------------------------
// Image compression via sharp (lazy-loaded to avoid issues on edge runtime)
// ---------------------------------------------------------------------------

let _sharp: typeof import('sharp') | null = null;

async function getSharp() {
  if (!_sharp) {
    _sharp = (await import('sharp')).default;
  }
  return _sharp;
}

/**
 * Compress image buffer. Converts to WebP at high quality (visually lossless).
 * Falls back to original buffer if sharp fails.
 */
export async function compressImage(buffer: Buffer, originalExt: string): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  try {
    const sharp = await getSharp();
    const img = sharp(buffer);
    const metadata = await img.metadata();

    // Don't touch GIFs (animated) or very small images
    if (originalExt === '.gif' || buffer.length < 5_000) {
      return { buffer, ext: originalExt, contentType: IMAGE_CONTENT_TYPES[originalExt] || 'image/png' };
    }

    // Resize if extremely large (> 4096px on any side) to save bandwidth
    let pipeline = img;
    if (metadata.width && metadata.width > 4096) {
      pipeline = pipeline.resize({ width: 4096, withoutEnlargement: true });
    }
    if (metadata.height && metadata.height > 4096) {
      pipeline = pipeline.resize({ height: 4096, withoutEnlargement: true });
    }

    const webpBuffer = await pipeline
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    // Only use WebP if it's actually smaller
    if (webpBuffer.length < buffer.length) {
      return { buffer: webpBuffer, ext: '.webp', contentType: 'image/webp' };
    }

    return { buffer, ext: originalExt, contentType: IMAGE_CONTENT_TYPES[originalExt] || 'image/png' };
  } catch {
    return { buffer, ext: originalExt, contentType: IMAGE_CONTENT_TYPES[originalExt] || 'image/png' };
  }
}

// ---------------------------------------------------------------------------
// Core upload
// ---------------------------------------------------------------------------

async function putObject(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl = 'public, max-age=31536000'): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return getR2PublicUrl(key);
}

// ---------------------------------------------------------------------------
// Public upload API (mirrors lib/storage.js signatures)
// ---------------------------------------------------------------------------

/** Upload image with compression → returns public R2 URL */
export async function uploadImage(buffer: Buffer, originalFilename: string): Promise<{ filename: string; url: string; contentType: string }> {
  const originalExt = path.extname(originalFilename).toLowerCase() || '.png';
  const compressed = await compressImage(buffer, originalExt);

  const basename = `${uuidv4()}${compressed.ext}`;
  const key = `ai-ugc/${basename}`;
  const url = await putObject(key, compressed.buffer, compressed.contentType);

  return { filename: basename, url, contentType: compressed.contentType };
}

/** Upload video → returns public R2 URL */
export async function uploadVideo(buffer: Buffer, originalFilename: string): Promise<{ filename: string; url: string; contentType: string }> {
  const ext = path.extname(originalFilename).toLowerCase() || '.mp4';
  const contentType = VIDEO_CONTENT_TYPES[ext] || 'video/mp4';
  const basename = `${uuidv4()}${ext}`;
  const key = `ai-ugc/videos/${basename}`;

  const url = await putObject(key, buffer, contentType);
  return { filename: basename, url, contentType };
}

/** Upload arbitrary buffer to a folder */
export async function uploadBuffer(buffer: Buffer, filename: string, options: { folder?: string; contentType?: string } = {}): Promise<string> {
  const { folder = 'ai-ugc', contentType = 'application/octet-stream' } = options;
  const key = `${folder}/${filename}`;
  return putObject(key, buffer, contentType);
}

/** Upload file from local path */
export async function uploadFile(localPath: string, options: { folder?: string; filename?: string; contentType?: string } = {}): Promise<string> {
  const { folder = 'ai-ugc', filename = path.basename(localPath), contentType = 'application/octet-stream' } = options;
  const buffer = await readFile(localPath);
  const key = `${folder}/${filename}`;
  return putObject(key, buffer, contentType);
}

/** Upload video from local file path */
export async function uploadVideoFromPath(localPath: string, customFilename?: string): Promise<{ filename: string; url: string }> {
  const filename = customFilename || `${uuidv4()}.mp4`;
  const key = `ai-ugc/videos/${filename}`;
  const buffer = await readFile(localPath);
  const url = await putObject(key, buffer, 'video/mp4');
  return { filename, url };
}

/** Upload temp file */
export async function uploadTemp(localPath: string, filename: string): Promise<string> {
  return uploadFile(localPath, { folder: 'ai-ugc/temp', filename, contentType: 'video/mp4' });
}

// ---------------------------------------------------------------------------
// Video object path helpers (for resumable upload flow)
// ---------------------------------------------------------------------------

export function buildVideoObjectPath(originalFilename = 'video.mp4'): string {
  const ext = path.extname(originalFilename).toLowerCase() || '.mp4';
  return `ai-ugc/videos/${uuidv4()}${ext}`;
}

export function getVideoPublicUrl(objectPath: string): string {
  return getR2PublicUrl(objectPath);
}

// ---------------------------------------------------------------------------
// Multipart / resumable upload support for direct browser uploads
// ---------------------------------------------------------------------------

/**
 * For R2, we use presigned PUT URLs instead of GCS resumable sessions.
 * The browser uploads directly to R2 via a presigned URL.
 */
export async function createPresignedUploadUrl(objectPath: string, contentType = 'video/mp4'): Promise<string> {
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectPath,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

/** Check if object exists and return metadata */
export async function getVideoObjectMetadata(objectPath: string): Promise<{ objectPath: string; gcsUrl: string; size: number; contentType: string } | null> {
  try {
    const resp = await getClient().send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectPath }),
    );
    return {
      objectPath,
      gcsUrl: getR2PublicUrl(objectPath),
      size: resp.ContentLength || 0,
      contentType: resp.ContentType || 'video/mp4',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Download / Delete
// ---------------------------------------------------------------------------

/** Download object to buffer */
export async function downloadToBuffer(url: string): Promise<Buffer> {
  const key = r2KeyFromUrl(url);
  const resp = await getClient().send(
    new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
  );
  const chunks: Uint8Array[] = [];
  // @ts-expect-error Body is a readable stream
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Download object to local path */
export async function downloadToPath(url: string, localPath: string): Promise<string> {
  const buf = await downloadToBuffer(url);
  await writeFile(localPath, buf);
  return localPath;
}

/** Delete object */
export async function deleteFile(url: string): Promise<boolean> {
  try {
    const key = r2KeyFromUrl(url);
    await getClient().send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
    );
    return true;
  } catch (error) {
    console.error('R2 delete error:', (error as Error).message);
    return false;
  }
}

/** Upload a raw buffer with a specific key (used by migration) */
export async function uploadRawBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
  return putObject(key, buffer, contentType);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract R2 object key from a public R2 URL */
function r2KeyFromUrl(url: string): string {
  if (url.startsWith(R2_PUBLIC_URL)) {
    return url.slice(R2_PUBLIC_URL.length + 1);
  }
  // Might already be just a key
  return url;
}

/** Check if a URL is an R2 URL */
export function isR2Url(url: string): boolean {
  return !!url && (url.startsWith(R2_PUBLIC_URL) || url.includes('.r2.dev/'));
}

/** Check if a URL is a GCS URL */
export function isGcsUrl(url: string): boolean {
  return !!url && url.includes('storage.googleapis.com');
}

export { R2_PUBLIC_URL, R2_BUCKET_NAME };
