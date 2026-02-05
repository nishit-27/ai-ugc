/**
 * Upload files to GCS using presigned URLs.
 * Env: GCS_BUCKET_NAME, GCS_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS or GCS_SERVICE_ACCOUNT_KEY
 */

import uploadModule from './upload-via-presigned.cjs';

export const {
  config,
  storage,
  getPresignedUploadUrl,
  getSignedReadUrl,
  putToPresignedUrl,
  uploadBuffer,
} = uploadModule;

export default uploadModule;
