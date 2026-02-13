import path from 'path';
import fs from 'fs';
import os from 'os';
import { fal } from '@fal-ai/client';
import { getTemplateJob, updateTemplateJob, getModelImage, updatePipelineBatchProgress } from '@/lib/db';
import { uploadVideoFromPath, downloadToBuffer as gcsDownloadToBuffer } from '@/lib/storage';
import { downloadFile, getVideoDuration, trimVideo } from '@/lib/serverUtils';
import { addTextOverlay, mixAudio, concatVideos, stripAudio } from '@/lib/ffmpegOps';
import { config } from '@/lib/config';
import { rapidApiLimiter } from '@/lib/rateLimiter';
import type { MiniAppStep, VideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uploadBuffer } = require('./upload-via-presigned.cjs');

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Download a file (from GCS or HTTP) to a local path.
 */
async function downloadToLocal(url: string, destPath: string): Promise<void> {
  if (url.includes('storage.googleapis.com')) {
    const buffer = await gcsDownloadToBuffer(url);
    fs.writeFileSync(destPath, buffer);
  } else {
    await downloadFile(url, destPath);
  }
}

/**
 * Get TikTok download URL (same logic as processJob.ts).
 */
async function getTikTokDownloadUrl(tiktokUrl: string): Promise<string | null> {
  const rapidApiKey = config.RAPIDAPI_KEY;
  if (!rapidApiKey) return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');
  const normalizedUrl = tiktokUrl.trim();
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await rapidApiLimiter.acquire();

    const result = await new Promise<{ url: string | null; shouldRetry: boolean }>((resolve) => {
      const encodedUrl = encodeURIComponent(normalizedUrl);
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
            resolve({ url: null, shouldRetry: true });
            return;
          }
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            resolve({ url: null, shouldRetry: false });
            return;
          }
          try {
            const json = JSON.parse(data);
            const playUrl = json.play || json.hdplay || json.data?.play || json.data?.hdplay;
            resolve({ url: playUrl || null, shouldRetry: !playUrl });
          } catch {
            resolve({ url: null, shouldRetry: true });
          }
        });
      });
      req.on('error', () => resolve({ url: null, shouldRetry: true }));
      req.end();
    });

    if (result.url) return result.url;
    if (!result.shouldRetry || attempt === maxRetries) return null;

    const delay = baseDelay * Math.pow(2, attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  return null;
}

/**
 * Upload an image to FAL-accessible presigned URL.
 */
async function uploadImageToFal(imageUrl: string, jobId: string): Promise<string> {
  if (imageUrl.startsWith('https://fal.media') || imageUrl.startsWith('https://v3.fal.media')) {
    return imageUrl;
  }

  let buffer: Buffer;
  let ext = '.png';

  if (imageUrl.includes('storage.googleapis.com')) {
    buffer = Buffer.from(await gcsDownloadToBuffer(imageUrl));
    const extMatch = imageUrl.match(/\.(\w+)(\?|$)/);
    if (extMatch) ext = '.' + extMatch[1];
  } else {
    const tempPath = path.join(getTempDir(), `img-${jobId}-${Date.now()}.png`);
    try {
      await downloadFile(imageUrl, tempPath);
      buffer = fs.readFileSync(tempPath);
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return await uploadBuffer(buffer, contentType, `template-img-${jobId}-${Date.now()}${ext}`);
}

/**
 * Prepare a video for FAL (download + trim + upload to presigned).
 */
async function prepareVideoForFal(videoUrl: string, maxSeconds: number, jobId: string): Promise<string> {
  const tempDir = getTempDir();
  const base = path.join(tempDir, `tpl-video-${jobId}-${Date.now()}`);
  const downloaded = `${base}-full.mp4`;
  const trimmed = `${base}-trimmed.mp4`;

  try {
    await downloadToLocal(videoUrl, downloaded);
    const duration = getVideoDuration(downloaded);
    const toUpload = duration > maxSeconds ? trimmed : downloaded;
    if (duration > maxSeconds) {
      trimVideo(downloaded, trimmed, maxSeconds);
    }
    const buffer = fs.readFileSync(toUpload);
    return await uploadBuffer(buffer, 'video/mp4', `tpl-video-${jobId}.mp4`);
  } finally {
    try { fs.unlinkSync(downloaded); } catch {}
    try { fs.unlinkSync(trimmed); } catch {}
  }
}

/**
 * Process a single pipeline step.
 * Takes the current video path and returns the new video path.
 */
async function processStep(
  step: MiniAppStep,
  currentVideoPath: string,
  jobId: string,
  stepIndex: number,
  stepOutputs: Map<string, string>
): Promise<string> {
  const tempDir = getTempDir();

  switch (step.type) {
    case 'video-generation': {
      const cfg = step.config as VideoGenConfig;
      const falKey = config.FAL_KEY;
      if (!falKey) throw new Error('FAL API key not configured');

      fal.config({ credentials: falKey });

      // Get model image — direct upload URL or from model
      let imageUrl: string | undefined;
      if (cfg.imageUrl) {
        imageUrl = cfg.imageUrl;
      } else if (cfg.imageId) {
        const img = await getModelImage(cfg.imageId);
        if (img) imageUrl = img.gcsUrl;
      }
      if (!imageUrl) throw new Error('Model image is required for video generation');

      const falImageUrl = await uploadImageToFal(imageUrl, jobId);

      if (cfg.mode === 'subtle-animation') {
        // Veo 3.1 image-to-video
        const veo = config.veoSettings;
        const falEndpoint = 'fal-ai/veo3.1/image-to-video';

        // Submit to queue and store request_id for recovery
        const { request_id } = await fal.queue.submit(falEndpoint, {
          input: {
            image_url: falImageUrl,
            prompt: cfg.prompt || config.veoPrompt,
            aspect_ratio: (cfg.aspectRatio || veo.aspectRatio) as '9:16' | '16:9' | 'auto',
            duration: (cfg.duration || veo.duration) as '4s' | '6s' | '8s',
            resolution: (cfg.resolution || veo.resolution) as '720p' | '1080p',
            generate_audio: cfg.generateAudio ?? veo.generateAudio,
          },
        });

        await updateTemplateJob(jobId, {
          step: `Step ${stepIndex + 1}: Veo 3.1 — generating...`,
          falRequestId: request_id,
          falEndpoint,
        });

        console.log(`[FAL] Template ${jobId} step ${stepIndex}: submitted Veo 3.1, request_id=${request_id}`);

        const result = await fal.queue.result(falEndpoint, { requestId: request_id });

        const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
        if (!videoData?.url) throw new Error('No video URL from Veo 3.1 image-to-video');

        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${Date.now()}.mp4`);
        await downloadFile(videoData.url, outputPath);

        // Strip audio if user toggled audio off
        if (cfg.generateAudio === false) {
          const silentPath = path.join(tempDir, `tpl-step-${stepIndex}-silent-${Date.now()}.mp4`);
          stripAudio(outputPath, silentPath);
          try { fs.unlinkSync(outputPath); } catch {}
          return silentPath;
        }
        return outputPath;
      } else {
        // Motion control — needs input video (currentVideoPath is already local)
        const maxSec = cfg.maxSeconds || 10;
        const duration = getVideoDuration(currentVideoPath);
        let videoToUpload = currentVideoPath;
        let trimmedPath: string | undefined;

        if (duration > maxSec) {
          trimmedPath = path.join(tempDir, `tpl-mc-trimmed-${stepIndex}-${Date.now()}.mp4`);
          trimVideo(currentVideoPath, trimmedPath, maxSec);
          videoToUpload = trimmedPath;
        }

        let falVideoUrl: string;
        try {
          const buffer = fs.readFileSync(videoToUpload);
          falVideoUrl = await uploadBuffer(buffer, 'video/mp4', `tpl-mc-${jobId}-step${stepIndex}.mp4`);
        } finally {
          if (trimmedPath) try { fs.unlinkSync(trimmedPath); } catch {}
        }

        const falEndpoint = 'fal-ai/kling-video/v2.6/standard/motion-control';

        // Submit to queue and store request_id for recovery
        const { request_id } = await fal.queue.submit(falEndpoint, {
          input: {
            image_url: falImageUrl,
            video_url: falVideoUrl,
            character_orientation: 'video',
            keep_original_sound: cfg.generateAudio ?? true,
            prompt: cfg.prompt || config.prompt,
          },
        });

        await updateTemplateJob(jobId, {
          step: `Step ${stepIndex + 1}: Motion Control — processing...`,
          falRequestId: request_id,
          falEndpoint,
        });

        console.log(`[FAL] Template ${jobId} step ${stepIndex}: submitted Motion Control, request_id=${request_id}`);

        const result = await fal.queue.result(falEndpoint, { requestId: request_id });

        const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
        if (!videoData?.url) throw new Error('No video URL from motion-control');

        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${Date.now()}.mp4`);
        await downloadFile(videoData.url, outputPath);

        // Strip audio if user toggled audio off
        if (cfg.generateAudio === false) {
          const silentPath = path.join(tempDir, `tpl-step-${stepIndex}-silent-${Date.now()}.mp4`);
          stripAudio(outputPath, silentPath);
          try { fs.unlinkSync(outputPath); } catch {}
          return silentPath;
        }
        return outputPath;
      }
    }

    case 'text-overlay': {
      const cfg = step.config as TextOverlayConfig;
      const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${Date.now()}.mp4`);
      await addTextOverlay(currentVideoPath, outputPath, cfg);
      return outputPath;
    }

    case 'bg-music': {
      const cfg = step.config as BgMusicConfig;
      const trackUrl = cfg.customTrackUrl || cfg.trackId;
      if (!trackUrl) throw new Error('No music track specified');

      // Derive effective audioMode from per-step map:
      // If any target step has 'replace', use 'replace' for the final mix
      let effectiveAudioMode: 'replace' | 'mix' = 'mix';
      if (cfg.audioModePerStep) {
        const targetIds = cfg.applyToSteps?.length ? cfg.applyToSteps : Object.keys(cfg.audioModePerStep);
        if (targetIds.some((id) => cfg.audioModePerStep![id] === 'replace')) {
          effectiveAudioMode = 'replace';
        }
      }
      const effectiveCfg = { ...cfg, audioMode: effectiveAudioMode };

      // Download the music track
      const audioPath = path.join(tempDir, `tpl-audio-${stepIndex}-${Date.now()}.mp3`);
      await downloadToLocal(trackUrl, audioPath);

      const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${Date.now()}.mp4`);
      try {
        mixAudio(currentVideoPath, audioPath, outputPath, effectiveCfg);
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
      return outputPath;
    }

    case 'attach-video': {
      const cfg = step.config as AttachVideoConfig;

      // Resolve clip source: pipeline step output → TikTok URL → uploaded URL
      let clipUrl: string | undefined;
      let clipIsLocal = false;
      if (cfg.sourceStepId && stepOutputs.has(cfg.sourceStepId)) {
        clipUrl = stepOutputs.get(cfg.sourceStepId);
        clipIsLocal = true;
      } else if (cfg.tiktokUrl) {
        const playUrl = await getTikTokDownloadUrl(cfg.tiktokUrl);
        if (!playUrl) throw new Error('Failed to get TikTok video URL for attach step');
        clipUrl = playUrl;
      } else {
        clipUrl = cfg.videoUrl;
      }
      if (!clipUrl) throw new Error('No video source for attach step');

      let attachPath: string;
      if (clipIsLocal) {
        // Already a local file path from a previous step
        attachPath = clipUrl;
      } else {
        attachPath = path.join(tempDir, `tpl-attach-${stepIndex}-${Date.now()}.mp4`);
        await downloadToLocal(clipUrl, attachPath);
      }

      const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${Date.now()}.mp4`);
      const videoPaths = cfg.position === 'before'
        ? [attachPath, currentVideoPath]
        : [currentVideoPath, attachPath];

      try {
        concatVideos(videoPaths, outputPath);
      } finally {
        if (!clipIsLocal) {
          try { fs.unlinkSync(attachPath); } catch {}
        }
      }
      return outputPath;
    }

    default:
      throw new Error(`Unknown mini-app type: ${step.type}`);
  }
}

/**
 * Process a template job: iterate through pipeline steps sequentially.
 */
export async function processTemplateJob(jobId: string): Promise<void> {
  const job = await getTemplateJob(jobId);
  if (!job) return;

  const tempDir = getTempDir();
  const tempFiles: string[] = [];

  try {
    await updateTemplateJob(jobId, { status: 'processing', step: 'Starting pipeline...' });

    // Get initial video
    let currentVideoPath: string;
    const enabledSteps = job.pipeline.filter((s: MiniAppStep) => s.enabled);
    const firstStep = enabledSteps[0];

    if (firstStep?.type === 'video-generation' && (firstStep.config as VideoGenConfig).mode === 'subtle-animation') {
      // No input video needed for image-to-video
      currentVideoPath = '';
    } else if (job.videoSource === 'upload' && job.videoUrl) {
      await updateTemplateJob(jobId, { step: 'Downloading uploaded video...' });
      currentVideoPath = path.join(tempDir, `tpl-input-${jobId}-${Date.now()}.mp4`);
      await downloadToLocal(job.videoUrl, currentVideoPath);
      tempFiles.push(currentVideoPath);
    } else if (job.tiktokUrl) {
      await updateTemplateJob(jobId, { step: 'Fetching TikTok video...' });
      const playUrl = await getTikTokDownloadUrl(job.tiktokUrl);
      if (!playUrl) throw new Error('Failed to get TikTok video URL');

      currentVideoPath = path.join(tempDir, `tpl-input-${jobId}-${Date.now()}.mp4`);
      await downloadFile(playUrl, currentVideoPath);
      tempFiles.push(currentVideoPath);
    } else {
      throw new Error('No video source provided');
    }

    // Process each enabled step, tracking outputs by step ID
    const stepOutputs = new Map<string, string>();
    const stepResults: { stepId: string; type: string; label: string; outputUrl: string }[] = [];

    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      const stepLabel = getStepLabel(step);

      await updateTemplateJob(jobId, {
        currentStep: i,
        step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel}`,
      });

      const newVideoPath = await processStep(step, currentVideoPath, jobId, i, stepOutputs);
      stepOutputs.set(step.id, newVideoPath);

      // Upload intermediate result to GCS
      const { url: stepUrl } = await uploadVideoFromPath(
        newVideoPath,
        `template-${jobId}-step-${i}.mp4`
      );
      stepResults.push({ stepId: step.id, type: step.type, label: stepLabel, outputUrl: stepUrl });

      // Save progress with step results so far
      await updateTemplateJob(jobId, {
        currentStep: i + 1,
        step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel} — done`,
        stepResults,
      });

      // Clean up previous temp file (but not the original input)
      if (currentVideoPath && i > 0) {
        try { fs.unlinkSync(currentVideoPath); } catch {}
      }

      currentVideoPath = newVideoPath;
      tempFiles.push(newVideoPath);
    }

    // Final result is same as last step result
    const finalUrl = stepResults.length > 0
      ? stepResults[stepResults.length - 1].outputUrl
      : (await uploadVideoFromPath(currentVideoPath, `template-${jobId}.mp4`)).url;

    await updateTemplateJob(jobId, {
      status: 'completed',
      step: 'Done!',
      outputUrl: finalUrl,
      stepResults,
      completedAt: new Date().toISOString(),
    });

    // Update pipeline batch progress if this job belongs to a batch
    if (job.pipelineBatchId) {
      try {
        await updatePipelineBatchProgress(job.pipelineBatchId);
      } catch (e) {
        console.error('Failed to update pipeline batch progress:', e);
      }
    }
  } catch (error) {
    await updateTemplateJob(jobId, {
      status: 'failed',
      step: 'Failed',
      error: error instanceof Error ? error.message : String(error),
    });

    // Update pipeline batch progress on failure too
    const failedJob = await getTemplateJob(jobId);
    if (failedJob?.pipelineBatchId) {
      try {
        await updatePipelineBatchProgress(failedJob.pipelineBatchId);
      } catch (e) {
        console.error('Failed to update pipeline batch progress:', e);
      }
    }
  } finally {
    // Clean up all temp files
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

function getStepLabel(step: MiniAppStep): string {
  switch (step.type) {
    case 'video-generation': {
      const cfg = step.config as VideoGenConfig;
      return cfg.mode === 'subtle-animation'
        ? 'Generating video (Veo 3.1 Subtle Animation)'
        : 'Generating video (Kling Motion Control)';
    }
    case 'text-overlay':
      return 'Adding text overlay';
    case 'bg-music':
      return 'Mixing background music';
    case 'attach-video':
      return 'Attaching video clip';
    default:
      return 'Processing';
  }
}

/**
 * Process a pipeline batch: resolve the TikTok URL ONCE, upload the video
 * to stable storage, then process all child jobs using the stable URL.
 * This avoids hitting RapidAPI N times for the same TikTok video.
 */
export async function processPipelineBatch(
  childJobIds: string[],
  tiktokUrl: string | null,
  videoUrl: string | null,
): Promise<void> {
  const tempDir = getTempDir();
  let sharedVideoPath: string | null = null;

  try {
    if (!videoUrl && tiktokUrl) {
      // Resolve TikTok URL ONCE for the entire batch
      console.log(`[PipelineBatch] Resolving TikTok URL once for ${childJobIds.length} jobs: ${tiktokUrl}`);
      const playUrl = await getTikTokDownloadUrl(tiktokUrl);
      if (!playUrl) throw new Error('Failed to get TikTok video URL');

      // Download video to temp file
      sharedVideoPath = path.join(tempDir, `pipeline-batch-input-${Date.now()}.mp4`);
      await downloadFile(playUrl, sharedVideoPath);

      // Upload to GCS for stable, long-lived access
      const { url: stableUrl } = await uploadVideoFromPath(
        sharedVideoPath,
        `pipeline-batch-input-${Date.now()}.mp4`
      );
      console.log(`[PipelineBatch] Video uploaded to stable storage: ${stableUrl.slice(0, 80)}...`);

      // Update all child jobs to use the stable URL instead of the TikTok URL
      for (const jobId of childJobIds) {
        await updateTemplateJob(jobId, { videoUrl: stableUrl, videoSource: 'upload' });
      }
    }

    // Process all child jobs in parallel
    // Each job now uses the stable GCS URL instead of re-resolving via RapidAPI
    await Promise.allSettled(
      childJobIds.map((id) =>
        processTemplateJob(id).catch((err) => {
          console.error(`[PipelineBatch] Child job ${id} failed:`, err);
        })
      )
    );
  } finally {
    if (sharedVideoPath) {
      try { fs.unlinkSync(sharedVideoPath); } catch {}
    }
  }
}
