/**
 * Upload helper — now uses R2 instead of GCS.
 *
 * Kept as a thin wrapper with the same `uploadBuffer(buffer, contentType, filename)`
 * signature so processJob.ts and processTemplateJob.ts don't need changes.
 * R2 URLs are public by default — no signing required.
 */
import * as r2 from './r2.ts';
import crypto from 'crypto';
import path from 'path';

function generateUniqueFilename(originalFilename = 'file') {
  const ext = path.extname(originalFilename) || '';
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `uploads/${timestamp}-${random}${ext}`;
}

/**
 * Upload a buffer to R2 and return a public URL.
 * Signature matches the old GCS version: (buffer, contentType, suggestedFilename) → URL string
 */
export async function uploadBuffer(buffer, contentType = 'application/octet-stream', suggestedFilename = 'file') {
  const filename = generateUniqueFilename(suggestedFilename);
  const url = await r2.uploadBuffer(Buffer.from(buffer), filename, {
    folder: 'ai-ugc',
    contentType,
  });
  return url;
}
