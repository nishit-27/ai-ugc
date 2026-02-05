/**
 * Upload files to Google Cloud Storage with public URLs.
 * Uses UPLOAD_STORAGE_BUCKET_KEY for bucket mapping:
 *   - IMAGES: runable_staging_image
 *   - DRIVE: runable_staging_files (for videos)
 *
 * Env:
 *   UPLOAD_STORAGE_BUCKET_KEY - Base64 encoded bucket mapping
 *   GCS_SERVICE_ACCOUNT_KEY   - Service account JSON key
 */

import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Parse bucket mapping from base64 key
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

// Parse service account credentials
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

// Get bucket instances
const imageBucket = storage.bucket(buckets.IMAGES);
const videoBucket = storage.bucket(buckets.DRIVE);

/**
 * Get public URL for a file
 */
function getPublicUrl(bucketName, filename) {
  return `https://storage.googleapis.com/${bucketName}/${filename}`;
}

/**
 * Get signed URL for a file (for preview/download without public access)
 * @param {string} gcsFilename - The filename in the bucket
 * @param {string} bucketType - 'IMAGES' or 'DRIVE'
 * @param {number} expiresInMinutes - URL expiration time (default 1 year)
 * @returns {Promise<string>} - Signed URL
 */
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
 * Get signed URL from a full GCS public URL
 * @param {string} gcsUrl - Full GCS URL (https://storage.googleapis.com/bucket/filename)
 * @param {number} expiresInMinutes - URL expiration time (default 1 year)
 * @returns {Promise<string>} - Signed URL
 */
export async function getSignedUrlFromPublicUrl(gcsUrl, expiresInMinutes = 10080) {
  const safeExpiresInMinutes = Math.min(expiresInMinutes, 10080);
  let bucketName = null;
  let filename = null;

  try {
    if (gcsUrl.startsWith('gs://')) {
      const without = gcsUrl.replace('gs://', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    } else if (gcsUrl.startsWith('https://storage.googleapis.com/')) {
      const without = gcsUrl.replace('https://storage.googleapis.com/', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    } else if (gcsUrl.startsWith('https://storage.cloud.google.com/')) {
      const without = gcsUrl.replace('https://storage.cloud.google.com/', '');
      const [b, ...rest] = without.split('/');
      bucketName = b;
      filename = rest.join('/');
    }
  } catch {
    // fall through to parseGcsUrl
  }

  if (!bucketName || !filename) {
    const parsed = parseGcsUrl(gcsUrl);
    bucketName = parsed.bucket?.name;
    filename = parsed.filename;
  }

  if (!bucketName || !filename) {
    throw new Error(`Unable to parse GCS URL: ${gcsUrl}`);
  }

  const file = storage.bucket(bucketName).file(filename);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + safeExpiresInMinutes * 60 * 1000,
  });

  return url;
}

/**
 * Upload image and return public URL
 */
export async function uploadImage(buffer, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase() || '.png';
  const filename = `ai-ugc/${uuidv4()}${ext}`;

  const contentType = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  }[ext] || 'image/png';

  const file = imageBucket.file(filename);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  const url = getPublicUrl(buckets.IMAGES, filename);

  return { filename: path.basename(filename), url, contentType };
}

/**
 * Upload video and return public URL
 */
export async function uploadVideo(buffer, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase() || '.mp4';
  const filename = `ai-ugc/videos/${uuidv4()}${ext}`;

  const contentType = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime'
  }[ext] || 'video/mp4';

  const file = videoBucket.file(filename);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  const url = getPublicUrl(buckets.DRIVE, filename);

  return { filename: path.basename(filename), url, contentType };
}

/**
 * Upload buffer to specified bucket type
 */
export async function uploadBuffer(buffer, filename, options = {}) {
  const {
    folder = 'ai-ugc',
    contentType = 'application/octet-stream',
    bucketType = 'DRIVE',
  } = options;

  const bucket = bucketType === 'IMAGES' ? imageBucket : videoBucket;
  const bucketName = bucketType === 'IMAGES' ? buckets.IMAGES : buckets.DRIVE;
  const gcsFilename = `${folder}/${filename}`;

  const file = bucket.file(gcsFilename);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  return getPublicUrl(bucketName, gcsFilename);
}

/**
 * Upload file from local path
 */
export async function uploadFile(localPath, options = {}) {
  const {
    folder = 'ai-ugc',
    filename = path.basename(localPath),
    contentType = 'application/octet-stream',
    bucketType = 'DRIVE',
  } = options;

  const bucket = bucketType === 'IMAGES' ? imageBucket : videoBucket;
  const bucketName = bucketType === 'IMAGES' ? buckets.IMAGES : buckets.DRIVE;
  const gcsFilename = `${folder}/${filename}`;

  await bucket.upload(localPath, {
    destination: gcsFilename,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  return getPublicUrl(bucketName, gcsFilename);
}

/**
 * Upload video from local file path
 */
export async function uploadVideoFromPath(localPath, customFilename) {
  const filename = customFilename || `${uuidv4()}.mp4`;
  const gcsFilename = `ai-ugc/videos/${filename}`;

  await videoBucket.upload(localPath, {
    destination: gcsFilename,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000',
    },
  });

  const url = getPublicUrl(buckets.DRIVE, gcsFilename);
  return { filename, url };
}

/**
 * Upload temp file (for processing)
 */
export async function uploadTemp(localPath, filename) {
  return uploadFile(localPath, {
    folder: 'ai-ugc/temp',
    filename,
    contentType: 'video/mp4',
  });
}

/**
 * Download file to buffer
 */
export async function downloadToBuffer(gcsUrl) {
  const { bucket, filename } = parseGcsUrl(gcsUrl);
  const file = bucket.file(filename);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Download file to local path
 */
export async function downloadToPath(gcsUrl, localPath) {
  const { bucket, filename } = parseGcsUrl(gcsUrl);
  const file = bucket.file(filename);
  await file.download({ destination: localPath });
  return localPath;
}

/**
 * Delete file
 */
export async function deleteFile(gcsUrl) {
  try {
    const { bucket, filename } = parseGcsUrl(gcsUrl);
    await bucket.file(filename).delete();
    return true;
  } catch (error) {
    console.error('Error deleting file:', error.message);
    return false;
  }
}

/**
 * Delete temp files by prefix
 */
export async function cleanupTemp(prefix) {
  try {
    await videoBucket.deleteFiles({
      prefix: `ai-ugc/temp/${prefix}`
    });
  } catch (error) {
    console.error('Error cleaning up temp files:', error.message);
  }
}

/**
 * Parse GCS URL to get bucket and filename
 */
function parseGcsUrl(url) {
  // Remove query params if any
  if (url.includes('?')) {
    url = url.split('?')[0];
  }

  // Check which bucket it belongs to
  const imagePrefix = `https://storage.googleapis.com/${buckets.IMAGES}/`;
  const videoPrefix = `https://storage.googleapis.com/${buckets.DRIVE}/`;

  if (url.startsWith(imagePrefix)) {
    return {
      bucket: imageBucket,
      filename: url.slice(imagePrefix.length),
    };
  } else if (url.startsWith(videoPrefix)) {
    return {
      bucket: videoBucket,
      filename: url.slice(videoPrefix.length),
    };
  }

  // Default to video bucket
  return {
    bucket: videoBucket,
    filename: url,
  };
}

/**
 * List files in a folder
 */
export async function listFiles(folder = 'ai-ugc/videos') {
  const [files] = await videoBucket.getFiles({ prefix: folder });
  return files.map((file) => ({
    name: file.name,
    url: getPublicUrl(buckets.DRIVE, file.name),
    size: parseInt(file.metadata.size || '0'),
    created: file.metadata.timeCreated,
    updated: file.metadata.updated
  }));
}

/**
 * Check if file exists
 */
export async function fileExists(gcsFilename, bucketType = 'DRIVE') {
  const bucket = bucketType === 'IMAGES' ? imageBucket : videoBucket;
  const file = bucket.file(gcsFilename);
  const [exists] = await file.exists();
  return exists;
}

// Export bucket references for advanced usage
export { imageBucket, videoBucket, buckets };
