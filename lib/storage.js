

import { Storage } from '@google-cloud/storage';
import path from 'path';
import * as r2 from './r2';

let buckets = {
  IMAGES: 'runable_staging_image',
  DRIVE: 'runable_staging_files',
  TEMPLATES: 'runable-staging-templates',
};

if (process.env.UPLOAD_STORAGE_BUCKET_KEY) {
  try {
    const decoded = Buffer.from(process.env.UPLOAD_STORAGE_BUCKET_KEY, 'base64').toString('utf8');
    buckets = JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to parse UPLOAD_STORAGE_BUCKET_KEY:', e.message);
  }
}

let storageOptions = {};
if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
  try {
    const credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);
    storageOptions = {
      projectId: credentials.project_id,
      credentials,
    };
  } catch (e) {
    console.error('Failed to parse GCS_SERVICE_ACCOUNT_KEY:', e.message);
  }
}

const storage = new Storage(storageOptions);
const imageBucket = storage.bucket(buckets.IMAGES);
const videoBucket = storage.bucket(buckets.DRIVE);

function getGcsPublicUrl(bucketName, filename) {
  return `https://storage.googleapis.com/${bucketName}/${filename}`;
}

// ─── GCS signed URL helpers (kept for legacy URLs) ──────────────────────────

export async function getSignedUrl(gcsFilename, bucketType = 'DRIVE', expiresInMinutes = 525600) {
  const bucket = bucketType === 'IMAGES' ? imageBucket : videoBucket;
  const file = bucket.file(gcsFilename);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });
  return url;
}

/**
 * Get signed URL from a full public URL.
 * For R2 URLs → returns URL as-is (already public).
 * For GCS URLs → signs with GCS credentials.
 */
export async function getSignedUrlFromPublicUrl(url, expiresInMinutes = 10080) {
  // R2 URLs are already public — return as-is
  if (r2.isR2Url(url)) return url;

  // Not a GCS URL — return as-is
  if (!r2.isGcsUrl(url)) return url;

  const safeExpiresInMinutes = Math.min(expiresInMinutes, 10080);
  let bucketName = null;
  let filename = null;

  try {
    if (url.startsWith('gs://')) {
      const without = url.replace('gs://', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    } else if (url.startsWith('https://storage.googleapis.com/')) {
      const without = url.replace('https://storage.googleapis.com/', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    } else if (url.startsWith('https://storage.cloud.google.com/')) {
      const without = url.replace('https://storage.cloud.google.com/', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    }
  } catch {
    // fall through
  }

  if (!bucketName || !filename) {
    const parsed = parseGcsUrl(url);
    bucketName = parsed.bucket?.name;
    filename = parsed.filename;
  }

  if (!bucketName || !filename) {
    throw new Error(`Unable to parse GCS URL: ${url}`);
  }

  const file = storage.bucket(bucketName).file(filename);
  const [signed] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + safeExpiresInMinutes * 60 * 1000,
  });
  return signed;
}

// ─── Uploads (all go to R2 now) ─────────────────────────────────────────────

export async function uploadImage(buffer, originalFilename) {
  return r2.uploadImage(buffer, originalFilename);
}

export async function uploadVideo(buffer, originalFilename) {
  return r2.uploadVideo(buffer, originalFilename);
}

export function buildVideoObjectPath(originalFilename = 'video.mp4') {
  return r2.buildVideoObjectPath(originalFilename);
}

export function getVideoPublicUrl(objectPath) {
  return r2.getVideoPublicUrl(objectPath);
}

export async function createVideoResumableUploadSession({ objectPath, contentType = 'video/mp4' }) {
  // R2 uses presigned PUT URLs instead of GCS resumable sessions
  return r2.createPresignedUploadUrl(objectPath, contentType);
}

export async function getVideoObjectMetadata(objectPath) {
  return r2.getVideoObjectMetadata(objectPath);
}

export async function uploadBuffer(buffer, filename, options = {}) {
  const { folder = 'ai-ugc', contentType = 'application/octet-stream' } = options;
  return r2.uploadBuffer(buffer, filename, { folder, contentType });
}

export async function uploadFile(localPath, options = {}) {
  const { folder = 'ai-ugc', filename = path.basename(localPath), contentType = 'application/octet-stream' } = options;
  return r2.uploadFile(localPath, { folder, filename, contentType });
}

export async function uploadVideoFromPath(localPath, customFilename) {
  return r2.uploadVideoFromPath(localPath, customFilename);
}

export async function uploadTemp(localPath, filename) {
  return r2.uploadTemp(localPath, filename);
}

// ─── Downloads (support both R2 and GCS) ────────────────────────────────────

export async function downloadToBuffer(url) {
  if (r2.isR2Url(url)) return r2.downloadToBuffer(url);
  const { bucket, filename } = parseGcsUrl(url);
  const file = bucket.file(filename);
  const [buffer] = await file.download();
  return buffer;
}

export async function downloadToPath(url, localPath) {
  if (r2.isR2Url(url)) return r2.downloadToPath(url, localPath);
  const { bucket, filename } = parseGcsUrl(url);
  const file = bucket.file(filename);
  await file.download({ destination: localPath });
  return localPath;
}

// ─── Delete (support both) ──────────────────────────────────────────────────

export async function deleteFile(url) {
  try {
    if (r2.isR2Url(url)) return r2.deleteFile(url);
    const { bucket, filename } = parseGcsUrl(url);
    await bucket.file(filename).delete();
    return true;
  } catch (error) {
    console.error('Error deleting file:', error.message);
    return false;
  }
}

export async function cleanupTemp(prefix) {
  // Legacy GCS cleanup — R2 temp files use the same deleteFile approach
  try {
    await videoBucket.deleteFiles({ prefix: `ai-ugc/temp/${prefix}` });
  } catch (error) {
    console.error('Error cleaning up temp files:', error.message);
  }
}

// ─── GCS helpers ────────────────────────────────────────────────────────────

function parseGcsUrl(url) {
  if (url.includes('?')) url = url.split('?')[0];

  const imagePrefix = `https://storage.googleapis.com/${buckets.IMAGES}/`;
  const videoPrefix = `https://storage.googleapis.com/${buckets.DRIVE}/`;

  if (url.startsWith(imagePrefix)) {
    return { bucket: imageBucket, filename: url.slice(imagePrefix.length) };
  } else if (url.startsWith(videoPrefix)) {
    return { bucket: videoBucket, filename: url.slice(videoPrefix.length) };
  }

  return { bucket: videoBucket, filename: url };
}

export async function listFiles(folder = 'ai-ugc/videos') {
  const [files] = await videoBucket.getFiles({ prefix: folder });
  return files.map((file) => ({
    name: file.name,
    url: getGcsPublicUrl(buckets.DRIVE, file.name),
    size: parseInt(file.metadata.size || '0'),
    created: file.metadata.timeCreated,
    updated: file.metadata.updated,
  }));
}

export async function fileExists(gcsFilename, bucketType = 'DRIVE') {
  const bucket = bucketType === 'IMAGES' ? imageBucket : videoBucket;
  const file = bucket.file(gcsFilename);
  const [exists] = await file.exists();
  return exists;
}

// Export bucket refs for migration script
export { imageBucket, videoBucket, buckets };
