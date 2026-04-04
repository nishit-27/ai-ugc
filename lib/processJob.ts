import path from 'path';
import fs from 'fs';
import { fal } from '@fal-ai/client';
import { getJob, updateJob, createMediaFile, updateBatchProgress } from './db';
import { uploadVideoFromPath, downloadToBuffer as gcsDownloadToBuffer } from './storage';
import {
  getContentTypeFromExtension,
  getExtensionFromUrl,
  getVideoDuration,
  trimVideo,
  downloadFile,
} from './serverUtils';
import { getFalWebhookUrl } from './config';
import { uploadBuffer } from './upload-via-presigned.js';
import { getVideoDownloadUrl } from './videoDownload';
import { cleanupTempWorkspace, createTempWorkspace } from './tempWorkspace';
import { isRetryableError, retry } from './retry';
export { getVideoDownloadUrl } from './videoDownload';

async function withExternalRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return retry(fn, {
    retries: 3,
    delaysMs: [1000, 3000, 7000],
    shouldRetry: isRetryableError,
    onRetry: (error, attempt, delayMs) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ProcessJob] ${label} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${message}`);
    },
  });
}

/**
 * Prepare uploaded video for FAL.
 * Downloads from GCS, trims if needed, uploads to FAL-accessible presigned bucket.
 */
async function prepareUploadedVideoForFal(
  gcsUrl: string,
  maxSeconds: number,
  jobId: string,
  tempDir: string,
): Promise<string> {
  const base = path.join(tempDir, `uploaded-${jobId}-${Date.now()}`);
  const downloaded = `${base}-full.mp4`;
  const trimmed = `${base}-trimmed.mp4`;

  try {
    // Download from GCS (handles both GCS URLs and signed URLs)
    if (gcsUrl.includes('storage.googleapis.com')) {
      const buffer = await gcsDownloadToBuffer(gcsUrl);
      fs.writeFileSync(downloaded, buffer);
    } else {
      // Fallback to HTTP download for signed URLs or other URLs
      await downloadFile(gcsUrl, downloaded);
    }

    const duration = getVideoDuration(downloaded);
    console.log(`[Upload] Video duration: ${duration}s, max: ${maxSeconds}s`);

    const toUpload = duration > maxSeconds ? trimmed : downloaded;
    if (duration > maxSeconds) {
      console.log(`[Upload] Trimming video to ${maxSeconds}s...`);
      trimVideo(downloaded, trimmed, maxSeconds);
    }

    const buffer = fs.readFileSync(toUpload);
    return await uploadBuffer(buffer, 'video/mp4', `uploaded-${jobId}.mp4`);
  } finally {
    try { fs.unlinkSync(downloaded); } catch {}
    try { fs.unlinkSync(trimmed); } catch {}
  }
}

/**
 * Get image buffer and suggested extension from various sources.
 * Same approach as batch-motion-control: we need a buffer to upload via presigned URL.
 */
async function getImageBufferAndExt(
  imageUrl: string,
  jobId: string,
  tempDir: string,
): Promise<{ buffer: Buffer; ext: string }> {
  // 1) Local file path (e.g. uploads/xxx.png or absolute path)
  if (!imageUrl.startsWith('http')) {
    const cwd = process.cwd();
    const possiblePaths = [
      imageUrl,
      path.join(cwd, imageUrl),
      path.join(cwd, 'uploads', path.basename(imageUrl)),
    ];
    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase() || '.png';
          return { buffer, ext };
        }
      } catch {
        // skip
      }
    }
    throw new Error(`Image not found: ${imageUrl}. Use a full URL or a path under ${cwd}`);
  }

  // 2) Our GCS URL – fetch via GCS client (no public download)
  if (imageUrl.includes('storage.googleapis.com')) {
    try {
      const buffer = await gcsDownloadToBuffer(imageUrl);
      const ext = getExtensionFromUrl(imageUrl);
      return { buffer: Buffer.from(buffer), ext };
    } catch {
      // Fall through to HTTP download
    }
  }

  // 3) Any http(s) URL – download to temp then read (same as batch-motion-control flow)
  const ext = getExtensionFromUrl(imageUrl);
  const tempPath = path.join(tempDir, `image-${jobId}-${Date.now()}${ext}`);
  try {
    await downloadFile(imageUrl, tempPath);
    const buffer = fs.readFileSync(tempPath);
    return { buffer, ext };
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

/**
 * Upload image so FAL can use it. Returns a URL (presigned/signed) like batch-motion-control.
 * Always re-uploads to our presigned bucket so FAL gets a single, reliable link.
 */
async function uploadImageToFal(imageUrl: string, jobId: string, tempDir: string): Promise<string> {
  if (imageUrl.startsWith('https://fal.media') || imageUrl.startsWith('https://v3.fal.media')) {
    return imageUrl;
  }

  const { buffer, ext } = await getImageBufferAndExt(imageUrl, jobId, tempDir);
  const contentType = getContentTypeFromExtension(ext);
  const fileName = `model-image-${jobId}-${Date.now()}${ext}`;
  return await uploadBuffer(buffer, contentType, fileName);
}

export async function processJob(
  jobId: string,
  prompt: string,
  falKey: string,
  rapidApiKey: string
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const tempDir = createTempWorkspace(`job-${jobId}`);

  try {
    await updateJob(jobId, {
      status: 'processing',
      step: 'Starting...',
      error: null,
      outputUrl: null,
      completedAt: null,
      falRequestId: null,
      falEndpoint: null,
    });

    // Resolve social URL once — download, store in GCS, update DB
    // All subsequent processing (and recovery/webhook) uses the stable GCS URL
    if (job.tiktokUrl && job.videoSource !== 'upload') {
      await updateJob(jobId, { step: 'Fetching video...' });
      const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
      console.log(`[Video] Got play URL (${playUrl.length} chars)`);

      await updateJob(jobId, { step: 'Downloading and storing video...' });
      const tempPath = path.join(tempDir, `source-${jobId}-${Date.now()}.mp4`);
      try {
        await downloadFile(playUrl, tempPath);
        const { url: gcsUrl } = await uploadVideoFromPath(tempPath, `source-${jobId}.mp4`);
        await updateJob(jobId, { videoUrl: gcsUrl, videoSource: 'upload' });
        job.videoUrl = gcsUrl;
        job.videoSource = 'upload';
        console.log(`[Video] Stored in GCS: ${gcsUrl.slice(0, 80)}...`);
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }

    let falVideoUrl: string;

    if (job.videoSource === 'upload' && job.videoUrl) {
      await updateJob(jobId, { step: 'Preparing video for AI...' });
      console.log(`[Upload] Processing video: ${job.videoUrl.slice(0, 80)}...`);
      falVideoUrl = await prepareUploadedVideoForFal(job.videoUrl, job.maxSeconds || 10, jobId, tempDir);
      console.log(`[FAL] Video ready: ${falVideoUrl}`);
    } else {
      throw new Error('No video source provided. Please provide a video URL or upload a video.');
    }

    await updateJob(jobId, { step: 'Uploading model image...' });
    const falImageUrl = await uploadImageToFal(job.imageUrl, jobId, tempDir);

    await updateJob(jobId, { step: 'Generating video with AI...' });

    fal.config({ credentials: falKey });

    const falEndpoint = 'fal-ai/kling-video/v2.6/standard/motion-control';

    // Submit to FAL queue and store request_id IMMEDIATELY
    // so we can recover if the Lambda times out
    const { request_id } = await fal.queue.submit(falEndpoint, {
      input: {
        image_url: falImageUrl,
        video_url: falVideoUrl,
        character_orientation: 'video',
        keep_original_sound: true,
        prompt: job.customPrompt || prompt,
      },
      webhookUrl: getFalWebhookUrl(),
    });

    // Save request_id to DB before waiting — critical for recovery
    await updateJob(jobId, {
      step: 'AI is generating your video...',
      falRequestId: request_id,
      falEndpoint,
    });

    console.log(`[FAL] Job ${jobId}: submitted to FAL, request_id=${request_id}`);

    // Wait for FAL to finish processing (polls status until COMPLETED)
    await withExternalRetry(`subscribe status for ${jobId}`, () => fal.queue.subscribeToStatus(falEndpoint, {
      requestId: request_id,
      logs: true,
      onQueueUpdate: async (update) => {
        if (update.status === 'IN_QUEUE') {
          const pos = 'queue_position' in update ? (update as { queue_position?: number }).queue_position : undefined;
          await updateJob(jobId, { step: `In queue (position: ${pos ?? '...'})` });
        } else if (update.status === 'IN_PROGRESS') {
          await updateJob(jobId, { step: 'AI is generating your video...' });
        }
      },
    }));

    // Now fetch the completed result
    const result = await withExternalRetry(`fetch result for ${jobId}`, () => fal.queue.result(falEndpoint, { requestId: request_id }));

    const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
    if (!videoData?.url) {
      throw new Error('No video URL in API response');
    }
    const videoUrl = videoData.url;

    await updateJob(jobId, { step: 'Downloading and uploading result...' });

    const tempOutputPath = path.join(tempDir, `result-${jobId}.mp4`);

    try {
      await withExternalRetry(`download output for ${jobId}`, () => downloadFile(videoUrl, tempOutputPath));

      const { filename, url } = await uploadVideoFromPath(tempOutputPath, `result-${jobId}.mp4`);

      await createMediaFile({
        filename,
        originalName: `result-${jobId}.mp4`,
        fileType: 'video',
        gcsUrl: url,
        fileSize: fs.statSync(tempOutputPath).size,
        mimeType: 'video/mp4',
        jobId,
      });

      await updateJob(jobId, {
        status: 'completed',
        step: 'Done!',
        outputUrl: url,
        completedAt: new Date(),
      });
    } finally {
      try { fs.unlinkSync(tempOutputPath); } catch {}
    }
    // Update batch progress if this job is part of a batch
    const completedJob = await getJob(jobId);
    if (completedJob?.batchId) {
      await updateBatchProgress(completedJob.batchId);
    }
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      step: 'Failed',
    });

    // Update batch progress on failure too
    const failedJob = await getJob(jobId);
    if (failedJob?.batchId) {
      await updateBatchProgress(failedJob.batchId);
    }
  } finally {
    cleanupTempWorkspace(tempDir);
  }
}

/**
 * Process a job with a specific image URL (used by batch processor).
 * This allows overriding the job's stored imageUrl with a different one.
 */
export async function processJobWithImage(
  jobId: string,
  imageUrl: string,
  prompt: string,
  falKey: string,
  rapidApiKey: string
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const tempDir = createTempWorkspace(`job-${jobId}`);

  try {
    await updateJob(jobId, {
      status: 'processing',
      step: 'Starting...',
      error: null,
      outputUrl: null,
      completedAt: null,
      falRequestId: null,
      falEndpoint: null,
    });

    // Resolve social URL once — download, store in GCS, update DB
    if (job.tiktokUrl && job.videoSource !== 'upload') {
      await updateJob(jobId, { step: 'Fetching video...' });
      const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
      console.log(`[Video] Got play URL (${playUrl.length} chars)`);

      await updateJob(jobId, { step: 'Downloading and storing video...' });
      const tempPath = path.join(tempDir, `source-${jobId}-${Date.now()}.mp4`);
      try {
        await downloadFile(playUrl, tempPath);
        const { url: gcsUrl } = await uploadVideoFromPath(tempPath, `source-${jobId}.mp4`);
        await updateJob(jobId, { videoUrl: gcsUrl, videoSource: 'upload' });
        job.videoUrl = gcsUrl;
        job.videoSource = 'upload';
        console.log(`[Video] Stored in GCS: ${gcsUrl.slice(0, 80)}...`);
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }

    let falVideoUrl: string;

    if (job.videoSource === 'upload' && job.videoUrl) {
      await updateJob(jobId, { step: 'Preparing video for AI...' });
      console.log(`[Upload] Processing video: ${job.videoUrl.slice(0, 80)}...`);
      falVideoUrl = await prepareUploadedVideoForFal(job.videoUrl, job.maxSeconds || 10, jobId, tempDir);
      console.log(`[FAL] Video ready: ${falVideoUrl}`);
    } else {
      throw new Error('No video source provided. Please provide a video URL or upload a video.');
    }

    await updateJob(jobId, { step: 'Uploading model image...' });
    // Use the provided imageUrl instead of job.imageUrl
    const falImageUrl = await uploadImageToFal(imageUrl, jobId, tempDir);

    fal.config({ credentials: falKey });

    const falEndpoint = 'fal-ai/kling-video/v2.6/standard/motion-control';

    // Submit to FAL queue and store request_id IMMEDIATELY for recovery
    const { request_id } = await fal.queue.submit(falEndpoint, {
      input: {
        image_url: falImageUrl,
        video_url: falVideoUrl,
        character_orientation: 'video',
        keep_original_sound: true,
        prompt: job.customPrompt || prompt,
      },
      webhookUrl: getFalWebhookUrl(),
    });

    await updateJob(jobId, {
      step: 'AI is generating your video...',
      falRequestId: request_id,
      falEndpoint,
    });

    console.log(`[FAL] Job ${jobId} (batch): submitted to FAL, request_id=${request_id}`);

    // Wait for FAL to finish processing
    await withExternalRetry(`subscribe batch status for ${jobId}`, () => fal.queue.subscribeToStatus(falEndpoint, {
      requestId: request_id,
      logs: true,
      onQueueUpdate: async (update) => {
        if (update.status === 'IN_QUEUE') {
          const pos = 'queue_position' in update ? (update as { queue_position?: number }).queue_position : undefined;
          await updateJob(jobId, { step: `In queue (position: ${pos ?? '...'})` });
        } else if (update.status === 'IN_PROGRESS') {
          await updateJob(jobId, { step: 'AI is generating your video...' });
        }
      },
    }));

    // Now fetch the completed result
    const result = await withExternalRetry(`fetch batch result for ${jobId}`, () => fal.queue.result(falEndpoint, { requestId: request_id }));

    const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
    if (!videoData?.url) {
      throw new Error('No video URL in API response');
    }
    const videoUrl = videoData.url;

    await updateJob(jobId, { step: 'Downloading and uploading result...' });

    const tempOutputPath = path.join(tempDir, `result-${jobId}.mp4`);

    try {
      await withExternalRetry(`download batch output for ${jobId}`, () => downloadFile(videoUrl, tempOutputPath));

      const { filename, url } = await uploadVideoFromPath(tempOutputPath, `result-${jobId}.mp4`);

      await createMediaFile({
        filename,
        originalName: `result-${jobId}.mp4`,
        fileType: 'video',
        gcsUrl: url,
        fileSize: fs.statSync(tempOutputPath).size,
        mimeType: 'video/mp4',
        jobId,
      });

      await updateJob(jobId, {
        status: 'completed',
        step: 'Done!',
        outputUrl: url,
        completedAt: new Date(),
      });

      const completedJob = await getJob(jobId);
      if (completedJob?.batchId) {
        await updateBatchProgress(completedJob.batchId);
      }
    } finally {
      try { fs.unlinkSync(tempOutputPath); } catch {}
    }
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      step: 'Failed',
    });

    const failedJob = await getJob(jobId);
    if (failedJob?.batchId) {
      await updateBatchProgress(failedJob.batchId);
    }
  } finally {
    cleanupTempWorkspace(tempDir);
  }
}
