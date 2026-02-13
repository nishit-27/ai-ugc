import path from 'path';
import fs from 'fs';
import os from 'os';
import { fal } from '@fal-ai/client';
import { getJob, updateJob, createMediaFile, updateBatchProgress } from './db';
import { uploadVideoFromPath, downloadToBuffer as gcsDownloadToBuffer } from './storage';
import {
  getContentType,
  getContentTypeFromExtension,
  getExtensionFromUrl,
  getVideoDuration,
  trimVideo,
  downloadFile,
} from './serverUtils';
import { rapidApiLimiter } from './rateLimiter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uploadBuffer } = require('./upload-via-presigned.cjs');

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|reels)\//i.test(url);
}

/**
 * Get TikTok download URL using /api/download/video endpoint
 * Returns the 'play' URL which works reliably with FAL
 */
async function getTikTokDownloadUrlViaDownloadEndpoint(tiktokUrl: string, rapidApiKey: string): Promise<{ url: string | null; shouldRetry: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');

  return new Promise((resolve) => {
    const encodedUrl = encodeURIComponent(tiktokUrl);
    const options = {
      method: 'GET',
      hostname: 'tiktok-api23.p.rapidapi.com',
      path: `/api/download/video?url=${encodedUrl}`,
      headers: {
        'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    };

    const req = https.request(options, (res: import('http').IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 429) {
          console.warn(`[TikTok API] Rate limited (${res.statusCode}), will retry...`);
          resolve({ url: null, shouldRetry: true });
          return;
        }
        if (res.statusCode && res.statusCode >= 500) {
          console.warn(`[TikTok API] Server error (${res.statusCode}), will retry...`);
          resolve({ url: null, shouldRetry: true });
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          console.error(`[TikTok API] HTTP ${res.statusCode}:`, data.slice(0, 300));
          resolve({ url: null, shouldRetry: false });
          return;
        }
        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          console.log('[TikTok API] Download endpoint response keys:', Object.keys(json));

          if (json.error === 'Video not found') {
            console.warn('[TikTok API] Video not found via download endpoint');
            resolve({ url: null, shouldRetry: true });
            return;
          }

          const playUrl = extractPlayUrl(json);
          if (playUrl) {
            console.log('[TikTok API] Found play URL via download endpoint:', playUrl.slice(0, 100) + '...');
            resolve({ url: playUrl, shouldRetry: false });
          } else {
            console.error('[TikTok API] No play URL found in download response');
            resolve({ url: null, shouldRetry: false });
          }
        } catch (e) {
          console.error('[TikTok API] Parse error:', e);
          resolve({ url: null, shouldRetry: true });
        }
      });
    });
    req.on('error', (e: Error) => {
      console.error('[TikTok API] Request error:', e.message);
      resolve({ url: null, shouldRetry: true });
    });
    req.end();
  });
}

async function getTikTokDownloadUrl(tiktokUrl: string, rapidApiKey: string): Promise<string | null> {
  const normalizedUrl = tiktokUrl.trim();
  console.log('[TikTok API] Requesting download for:', normalizedUrl);
  console.log('[TikTok API] API Key present:', !!rapidApiKey, rapidApiKey ? `(${rapidApiKey.slice(0, 8)}...)` : '');

  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Acquire rate limit token before each attempt
    await rapidApiLimiter.acquire();

    console.log(`[TikTok API] Attempt ${attempt}/${maxRetries}...`);

    // Use /api/download/video - returns 'play' URLs that work with FAL
    const result = await getTikTokDownloadUrlViaDownloadEndpoint(normalizedUrl, rapidApiKey);

    if (result.url) {
      return result.url;
    }

    if (!result.shouldRetry || attempt === maxRetries) {
      console.error(`[TikTok API] Failed after ${attempt} attempt(s)`);
      return null;
    }

    // Exponential backoff
    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.log(`[TikTok API] Waiting ${delay}ms before retry...`);
    await new Promise((r) => setTimeout(r, delay));
  }

  return null;
}

/**
 * Extract play URL from /api/download/video response
 */
function extractPlayUrl(data: Record<string, unknown>): string | null {
  // Direct play URL (no watermark preferred)
  if (typeof data.play === 'string' && data.play) return data.play;
  if (typeof data.hdplay === 'string' && data.hdplay) return data.hdplay;
  if (typeof data.wmplay === 'string' && data.wmplay) return data.wmplay;

  // Nested under data object
  if (data.data && typeof data.data === 'object') {
    const d = data.data as Record<string, unknown>;
    if (typeof d.play === 'string' && d.play) return d.play;
    if (typeof d.hdplay === 'string' && d.hdplay) return d.hdplay;
    if (typeof d.wmplay === 'string' && d.wmplay) return d.wmplay;
    if (typeof d.video_url === 'string' && d.video_url) return d.video_url;
    if (typeof d.nwm_video_url === 'string' && d.nwm_video_url) return d.nwm_video_url;
    if (typeof d.wm_video_url === 'string' && d.wm_video_url) return d.wm_video_url;
  }

  // Nested under result object
  if (data.result && typeof data.result === 'object') {
    const r = data.result as Record<string, unknown>;
    if (typeof r.play === 'string' && r.play) return r.play;
    if (typeof r.video_url === 'string' && r.video_url) return r.video_url;
  }

  // Fallback to watermark versions
  if (typeof data.play_watermark === 'string' && data.play_watermark) return data.play_watermark;

  return null;
}

/**
 * Get Instagram video download URL using RapidAPI
 */
async function getInstagramDownloadUrlViaEndpoint(instagramUrl: string, rapidApiKey: string): Promise<{ url: string | null; shouldRetry: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');

  return new Promise((resolve) => {
    const encodedUrl = encodeURIComponent(instagramUrl);
    const options = {
      method: 'GET',
      hostname: 'instagram-looter2.p.rapidapi.com',
      path: `/post-dl?url=${encodedUrl}`,
      headers: {
        'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    };

    const req = https.request(options, (res: import('http').IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 429) {
          console.warn(`[Instagram API] Rate limited (${res.statusCode}), will retry...`);
          resolve({ url: null, shouldRetry: true });
          return;
        }
        if (res.statusCode && res.statusCode >= 500) {
          console.warn(`[Instagram API] Server error (${res.statusCode}), will retry...`);
          resolve({ url: null, shouldRetry: true });
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          console.error(`[Instagram API] HTTP ${res.statusCode}:`, data.slice(0, 300));
          resolve({ url: null, shouldRetry: false });
          return;
        }
        try {
          const json = JSON.parse(data);
          console.log('[Instagram API] Response keys:', Object.keys(json));

          // Try common response shapes
          const videoUrl = extractInstagramVideoUrl(json);
          if (videoUrl) {
            console.log('[Instagram API] Found video URL:', videoUrl.slice(0, 100) + '...');
            resolve({ url: videoUrl, shouldRetry: false });
          } else {
            console.error('[Instagram API] No video URL found in response');
            resolve({ url: null, shouldRetry: false });
          }
        } catch (e) {
          console.error('[Instagram API] Parse error:', e);
          resolve({ url: null, shouldRetry: true });
        }
      });
    });
    req.on('error', (e: Error) => {
      console.error('[Instagram API] Request error:', e.message);
      resolve({ url: null, shouldRetry: true });
    });
    req.end();
  });
}

/**
 * Extract video URL from Instagram API response
 */
function extractInstagramVideoUrl(data: Record<string, unknown>): string | null {
  // data.medias[0].link pattern (instagram-looter2 response)
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    const d = data.data as Record<string, unknown>;

    // medias array → find first video link
    if (Array.isArray(d.medias) && d.medias.length > 0) {
      for (const media of d.medias) {
        if (typeof media === 'object' && media !== null) {
          const m = media as Record<string, unknown>;
          if (typeof m.link === 'string' && m.link) return m.link;
          if (typeof m.url === 'string' && m.url) return m.url;
        }
      }
    }

    if (typeof d.video_url === 'string' && d.video_url) return d.video_url;
    if (typeof d.url === 'string' && d.url) return d.url;
  }

  // data[] array pattern (alternative APIs)
  if (Array.isArray(data.data) && data.data.length > 0) {
    const first = data.data[0];
    if (typeof first === 'object' && first !== null) {
      const d = first as Record<string, unknown>;
      if (typeof d.url === 'string' && d.url) return d.url;
      if (typeof d.link === 'string' && d.link) return d.link;
      if (typeof d.video_url === 'string' && d.video_url) return d.video_url;
    }
  }

  // Top-level fields
  if (typeof data.video_url === 'string' && data.video_url) return data.video_url;
  if (typeof data.url === 'string' && data.url) return data.url;

  return null;
}

async function getInstagramDownloadUrl(instagramUrl: string, rapidApiKey: string): Promise<string | null> {
  const normalizedUrl = instagramUrl.trim();
  console.log('[Instagram API] Requesting download for:', normalizedUrl);

  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await rapidApiLimiter.acquire();
    console.log(`[Instagram API] Attempt ${attempt}/${maxRetries}...`);

    const result = await getInstagramDownloadUrlViaEndpoint(normalizedUrl, rapidApiKey);

    if (result.url) {
      return result.url;
    }

    if (!result.shouldRetry || attempt === maxRetries) {
      console.error(`[Instagram API] Failed after ${attempt} attempt(s)`);
      return null;
    }

    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.log(`[Instagram API] Waiting ${delay}ms before retry...`);
    await new Promise((r) => setTimeout(r, delay));
  }

  return null;
}

/**
 * Auto-detect URL type and download video accordingly
 */
export async function getVideoDownloadUrl(url: string, rapidApiKey: string): Promise<string> {
  if (isTikTokUrl(url)) {
    const result = await getTikTokDownloadUrl(url, rapidApiKey);
    if (!result) {
      throw new Error('Failed to get TikTok video URL. The video may be private or unavailable.');
    }
    return result;
  }

  if (isInstagramUrl(url)) {
    const result = await getInstagramDownloadUrl(url, rapidApiKey);
    if (!result) {
      throw new Error('Failed to get Instagram video URL. The post may be private or unavailable.');
    }
    return result;
  }

  throw new Error('Unsupported URL. Only TikTok and Instagram URLs are supported.');
}

async function prepareVideoForFal(
  videoUrl: string,
  maxSeconds: number,
  jobId: string
): Promise<string> {
  // Use OS temp directory instead of local folder
  const tempDir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const base = path.join(tempDir, `video-${jobId}-${Date.now()}`);
  const downloaded = `${base}-full.mp4`;
  const trimmed = `${base}-trimmed.mp4`;

  try {
    await downloadFile(videoUrl, downloaded);
    const duration = getVideoDuration(downloaded);
    const toUpload = duration > maxSeconds ? trimmed : downloaded;
    if (duration > maxSeconds) {
      trimVideo(downloaded, trimmed, maxSeconds);
    }
    const buffer = fs.readFileSync(toUpload);
    return await uploadBuffer(buffer, 'video/mp4', 'video.mp4');
  } finally {
    // Cleanup temp files
    try { fs.unlinkSync(downloaded); } catch {}
    try { fs.unlinkSync(trimmed); } catch {}
  }
}

/**
 * Prepare uploaded video for FAL.
 * Downloads from GCS, trims if needed, uploads to FAL-accessible presigned bucket.
 */
async function prepareUploadedVideoForFal(
  gcsUrl: string,
  maxSeconds: number,
  jobId: string
): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

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
  jobId: string
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
  const tempDir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
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
async function uploadImageToFal(imageUrl: string, jobId: string): Promise<string> {
  if (imageUrl.startsWith('https://fal.media') || imageUrl.startsWith('https://v3.fal.media')) {
    return imageUrl;
  }

  const { buffer, ext } = await getImageBufferAndExt(imageUrl, jobId);
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

  try {
    let falVideoUrl: string;

    // Check if using uploaded video or TikTok URL
    if (job.videoSource === 'upload' && job.videoUrl) {
      // Handle uploaded video
      await updateJob(jobId, { step: 'Preparing uploaded video...' });
      console.log(`[Upload] Processing uploaded video: ${job.videoUrl.slice(0, 80)}...`);
      falVideoUrl = await prepareUploadedVideoForFal(job.videoUrl, job.maxSeconds || 10, jobId);
      console.log(`[FAL] Uploaded video ready: ${falVideoUrl}`);
    } else if (job.tiktokUrl) {
      // Handle TikTok/Instagram URL (auto-detect)
      await updateJob(jobId, { step: 'Fetching video...' });

      const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
      console.log(`[Video] Got play URL (${playUrl.length} chars)`);

      await updateJob(jobId, { step: 'Downloading and preparing video...' });
      falVideoUrl = await prepareVideoForFal(playUrl, job.maxSeconds || 10, jobId);
      console.log(`[FAL] Video uploaded: ${falVideoUrl}`);
    } else {
      throw new Error('No video source provided. Please provide a video URL or upload a video.');
    }

    await updateJob(jobId, { step: 'Uploading model image...' });
    const falImageUrl = await uploadImageToFal(job.imageUrl, jobId);

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
    });

    // Save request_id to DB before waiting — critical for recovery
    await updateJob(jobId, {
      step: 'AI is generating your video...',
      falRequestId: request_id,
      falEndpoint,
    });

    console.log(`[FAL] Job ${jobId}: submitted to FAL, request_id=${request_id}`);

    // Wait for FAL to complete (may timeout if Lambda dies, but request_id is saved)
    const result = await fal.queue.result(falEndpoint, { requestId: request_id });

    const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
    if (!videoData?.url) {
      throw new Error('No video URL in API response');
    }

    await updateJob(jobId, { step: 'Downloading and uploading result...' });

    const tempDir = path.join(os.tmpdir(), 'ai-ugc-temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempOutputPath = path.join(tempDir, `result-${jobId}.mp4`);

    try {
      await downloadFile(videoData.url, tempOutputPath);

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
        completedAt: new Date().toISOString(),
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

  try {
    let falVideoUrl: string;

    // Check if using uploaded video or TikTok URL
    if (job.videoSource === 'upload' && job.videoUrl) {
      // Handle uploaded video
      await updateJob(jobId, { step: 'Preparing uploaded video...' });
      console.log(`[Upload] Processing uploaded video: ${job.videoUrl.slice(0, 80)}...`);
      falVideoUrl = await prepareUploadedVideoForFal(job.videoUrl, job.maxSeconds || 10, jobId);
      console.log(`[FAL] Uploaded video ready: ${falVideoUrl}`);
    } else if (job.tiktokUrl) {
      // Handle TikTok/Instagram URL (auto-detect)
      await updateJob(jobId, { step: 'Fetching video...' });

      const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
      console.log(`[Video] Got play URL (${playUrl.length} chars)`);

      await updateJob(jobId, { step: 'Downloading and preparing video...' });
      falVideoUrl = await prepareVideoForFal(playUrl, job.maxSeconds || 10, jobId);
      console.log(`[FAL] Video uploaded: ${falVideoUrl}`);
    } else {
      throw new Error('No video source provided. Please provide a video URL or upload a video.');
    }

    await updateJob(jobId, { step: 'Uploading model image...' });
    // Use the provided imageUrl instead of job.imageUrl
    const falImageUrl = await uploadImageToFal(imageUrl, jobId);

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
    });

    await updateJob(jobId, {
      step: 'AI is generating your video...',
      falRequestId: request_id,
      falEndpoint,
    });

    console.log(`[FAL] Job ${jobId} (batch): submitted to FAL, request_id=${request_id}`);

    // Wait for FAL to complete (request_id is saved for recovery if Lambda dies)
    const result = await fal.queue.result(falEndpoint, { requestId: request_id });

    const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
    if (!videoData?.url) {
      throw new Error('No video URL in API response');
    }

    await updateJob(jobId, { step: 'Downloading and uploading result...' });

    const tempDir = path.join(os.tmpdir(), 'ai-ugc-temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempOutputPath = path.join(tempDir, `result-${jobId}.mp4`);

    try {
      await downloadFile(videoData.url, tempOutputPath);

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
        completedAt: new Date().toISOString(),
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
  }
}
