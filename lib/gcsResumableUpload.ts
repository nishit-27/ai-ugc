/**
 * Direct browser → R2 upload via presigned PUT URL.
 * Replaces the old GCS resumable upload approach.
 * For R2, we upload the entire file in one PUT request using the presigned URL.
 * The function name is kept as uploadVideoDirectToGcs for backward compat with callers.
 */

type UploadProgressHandler = (uploadedBytes: number, totalBytes: number) => void;

type SessionResponse = {
  success: boolean;
  sessionUrl: string;
  objectPath: string;
  gcsUrl: string;
  error?: string;
};

type CompleteResponse = {
  success: boolean;
  filename: string;
  gcsUrl: string;
  url: string;
  path?: string;
  size?: number;
  mimeType?: string;
  error?: string;
};

type UploadOptions = {
  chunkSizeBytes?: number;
  maxRetriesPerChunk?: number;
  signal?: AbortSignal;
  onProgress?: UploadProgressHandler;
};

const DEFAULT_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function createSession(file: File): Promise<SessionResponse> {
  const res = await fetch('/api/upload-video/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'video/mp4',
      fileSize: file.size,
    }),
  });

  const data = (await res.json()) as SessionResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create upload session');
  }
  return data;
}

async function completeUpload(objectPath: string, originalName: string): Promise<CompleteResponse> {
  const res = await fetch('/api/upload-video/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectPath, originalName }),
  });

  const data = (await res.json()) as CompleteResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to finalize upload');
  }
  return data;
}

export async function uploadVideoDirectToGcs(
  file: File,
  options: UploadOptions = {}
): Promise<CompleteResponse> {
  const {
    maxRetriesPerChunk = DEFAULT_RETRIES,
    signal,
    onProgress,
  } = options;

  // 1. Get a presigned PUT URL from the server
  const { sessionUrl, objectPath } = await createSession(file);
  const totalBytes = file.size;
  const contentType = file.type || 'video/mp4';

  if (onProgress) onProgress(0, totalBytes);

  // 2. Upload the entire file via presigned PUT
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: file,
        signal,
      });

      if (res.ok) {
        if (onProgress) onProgress(totalBytes, totalBytes);
        break;
      }

      const body = await res.text();
      if (isRetryableStatus(res.status) && attempt < maxRetriesPerChunk) {
        attempt += 1;
        await sleep(400 * 2 ** attempt);
        continue;
      }

      throw new Error(`Upload failed (${res.status}): ${body || 'Unknown error'}`);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort) throw err;

      if (attempt < maxRetriesPerChunk) {
        attempt += 1;
        await sleep(400 * 2 ** attempt);
        continue;
      }

      if (err instanceof Error && err.message.toLowerCase().includes('failed to fetch')) {
        throw new Error('Direct upload failed. Check R2 CORS settings and network connectivity.');
      }
      throw err instanceof Error ? err : new Error('Upload failed');
    }
  }

  // 3. Tell the server to finalize (verify object exists, save to DB)
  return completeUpload(objectPath, file.name);
}
