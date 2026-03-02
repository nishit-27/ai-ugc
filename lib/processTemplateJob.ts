import path from 'path';
import fs from 'fs';
import os from 'os';
import { fal } from '@fal-ai/client';
import { getTemplateJob, updateTemplateJob, getModelImage, updatePipelineBatchProgress } from '@/lib/db';
import { uploadVideoFromPath, downloadToBuffer as gcsDownloadToBuffer } from '@/lib/storage';
import { downloadFile, getVideoDuration, trimVideo, trimVideoRange } from '@/lib/serverUtils';
import { addTextOverlay, mixAudio, concatVideos, stripAudio } from '@/lib/ffmpegOps';
import { composeMedia } from '@/lib/ffmpegCompose';
import { config, getFalWebhookUrl } from '@/lib/config';
import { getVideoDownloadUrl } from '@/lib/processJob';
import { uploadBuffer } from '@/lib/upload-via-presigned.js';
import { addTextOverlayToImage } from '@/lib/imageTextOverlay';
import type { MiniAppStep, VideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig, ComposeConfig, CarouselConfig } from '@/types';

/**
 * Semaphore for limiting concurrent local ffmpeg/sharp operations.
 * FAL API calls (video gen) are pure network I/O and don't need limiting,
 * but text overlay, audio mix, concat, trim etc. are CPU/memory-heavy.
 */
class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private limit: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

const localProcessingSemaphore = new Semaphore(5);

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
 * Apply inline BG music to a video file (used when applyToSteps targets specific steps).
 */
async function applyInlineMusic(
  videoPath: string,
  music: { config: BgMusicConfig; trackPath: string },
  stepIndex: number,
  jobId?: string,
): Promise<string> {
  const tempDir = getTempDir();
  const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-music-${jobId || 'x'}-${Date.now()}.mp4`);
  let effectiveAudioMode: 'replace' | 'mix' = 'mix';
  if (music.config.audioModePerStep) {
    const vals = Object.values(music.config.audioModePerStep);
    if (vals.some((m) => m === 'replace')) effectiveAudioMode = 'replace';
  }
  if (music.config.audioMode) effectiveAudioMode = music.config.audioMode;
  const effectiveCfg = { ...music.config, audioMode: effectiveAudioMode };
  mixAudio(videoPath, music.trackPath, outputPath, effectiveCfg);
  return outputPath;
}
/**
 * Process a single pipeline step.
 * Takes the current video path and returns the new video path.
 */
export async function processStep(
  step: MiniAppStep,
  currentVideoPath: string,
  jobId: string,
  stepIndex: number,
  stepOutputs: Map<string, string>,
  inlineMusic?: { config: BgMusicConfig; trackPath: string },
  carouselImagePaths?: string[] | null,
): Promise<string | string[]> {
  const tempDir = getTempDir();
  switch (step.type) {
    case 'video-generation': {
      const cfg = step.config as VideoGenConfig;
      const falKey = config.FAL_KEY;
      if (!falKey) throw new Error('FAL API key not configured');
      fal.config({ credentials: falKey });
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
        const veo = config.veoSettings;
        const falEndpoint = 'fal-ai/veo3.1/image-to-video';
        const { request_id } = await fal.queue.submit(falEndpoint, {
          input: {
            image_url: falImageUrl,
            prompt: cfg.prompt || config.veoPrompt,
            aspect_ratio: (cfg.aspectRatio || veo.aspectRatio) as '9:16' | '16:9' | 'auto',
            duration: (cfg.duration || veo.duration) as '4s' | '6s' | '8s',
            resolution: (cfg.resolution || veo.resolution) as '720p' | '1080p',
            generate_audio: cfg.generateAudio ?? veo.generateAudio,
          },
          webhookUrl: getFalWebhookUrl(),
        });
        await updateTemplateJob(jobId, {
          step: `Step ${stepIndex + 1}: Veo 3.1 — generating...`,
          falRequestId: request_id,
          falEndpoint,
        });
        console.log(`[FAL] Template ${jobId} step ${stepIndex}: submitted Veo 3.1, request_id=${request_id}`);
        await fal.queue.subscribeToStatus(falEndpoint, {
          requestId: request_id,
          logs: true,
        });
        const result = await fal.queue.result(falEndpoint, { requestId: request_id });
        const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
        if (!videoData?.url) throw new Error('No video URL from Veo 3.1 image-to-video');
        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${jobId}-${Date.now()}.mp4`);
        await downloadFile(videoData.url, outputPath);
        if (cfg.generateAudio === false) {
          const silentPath = path.join(tempDir, `tpl-step-${stepIndex}-silent-${jobId}-${Date.now()}.mp4`);
          stripAudio(outputPath, silentPath);
          try { fs.unlinkSync(outputPath); } catch {}
          return silentPath;
        }
        return outputPath;
      } else {
        const maxSec = cfg.maxSeconds || 10;
        const duration = getVideoDuration(currentVideoPath);
        let videoToUpload = currentVideoPath;
        let trimmedPath: string | undefined;
        if (cfg.trimStart != null && cfg.trimEnd != null) {
          trimmedPath = path.join(tempDir, `tpl-mc-trimmed-${stepIndex}-${jobId}-${Date.now()}.mp4`);
          trimVideoRange(currentVideoPath, trimmedPath, cfg.trimStart, cfg.trimEnd);
          videoToUpload = trimmedPath;
        } else if (duration > maxSec) {
          trimmedPath = path.join(tempDir, `tpl-mc-trimmed-${stepIndex}-${jobId}-${Date.now()}.mp4`);
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
        const { request_id } = await fal.queue.submit(falEndpoint, {
          input: {
            image_url: falImageUrl,
            video_url: falVideoUrl,
            character_orientation: 'video',
            keep_original_sound: cfg.generateAudio ?? true,
            prompt: cfg.prompt || config.prompt,
          },
          webhookUrl: getFalWebhookUrl(),
        });
        await updateTemplateJob(jobId, {
          step: `Step ${stepIndex + 1}: Motion Control — processing...`,
          falRequestId: request_id,
          falEndpoint,
        });
        console.log(`[FAL] Template ${jobId} step ${stepIndex}: submitted Motion Control, request_id=${request_id}`);
        await fal.queue.subscribeToStatus(falEndpoint, {
          requestId: request_id,
          logs: true,
        });
        const result = await fal.queue.result(falEndpoint, { requestId: request_id });
        const videoData = (result.data as { video?: { url?: string } })?.video ?? (result as { video?: { url?: string } }).video;
        if (!videoData?.url) throw new Error('No video URL from motion-control');
        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${jobId}-${Date.now()}.mp4`);
        await downloadFile(videoData.url, outputPath);
        if (cfg.generateAudio === false) {
          const silentPath = path.join(tempDir, `tpl-step-${stepIndex}-silent-${jobId}-${Date.now()}.mp4`);
          stripAudio(outputPath, silentPath);
          try { fs.unlinkSync(outputPath); } catch {}
          return silentPath;
        }
        return outputPath;
      }
    }
    case 'text-overlay': {
      await localProcessingSemaphore.acquire();
      try {
        const cfg = step.config as TextOverlayConfig;
        // Carousel mode: apply text overlay to each image
        if (carouselImagePaths && carouselImagePaths.length > 0) {
          const outputPaths: string[] = [];
          for (let imgIdx = 0; imgIdx < carouselImagePaths.length; imgIdx++) {
            const imgPath = carouselImagePaths[imgIdx];
            const ext = path.extname(imgPath) || '.jpg';
            const outPath = path.join(tempDir, `tpl-step-${stepIndex}-carousel-${imgIdx}-${jobId}-${Date.now()}${ext}`);
            await addTextOverlayToImage(imgPath, outPath, cfg);
            outputPaths.push(outPath);
          }
          return outputPaths;
        }
        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${jobId}-${Date.now()}.mp4`);
        await addTextOverlay(currentVideoPath, outputPath, cfg);
        return outputPath;
      } finally {
        localProcessingSemaphore.release();
      }
    }
    case 'bg-music': {
      await localProcessingSemaphore.acquire();
      try {
        const cfg = step.config as BgMusicConfig;
        const trackUrl = cfg.customTrackUrl || cfg.trackId;
        if (!trackUrl) throw new Error('No music track specified');
        let effectiveAudioMode: 'replace' | 'mix' = 'mix';
        if (cfg.audioModePerStep) {
          const targetIds = cfg.applyToSteps?.length ? cfg.applyToSteps : Object.keys(cfg.audioModePerStep);
          if (targetIds.some((id) => cfg.audioModePerStep![id] === 'replace')) {
            effectiveAudioMode = 'replace';
          }
        }
        const effectiveCfg = { ...cfg, audioMode: effectiveAudioMode };
        const audioPath = path.join(tempDir, `tpl-audio-${stepIndex}-${Date.now()}.mp3`);
        await downloadToLocal(trackUrl, audioPath);
        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${jobId}-${Date.now()}.mp4`);
        try {
          mixAudio(currentVideoPath, audioPath, outputPath, effectiveCfg);
        } finally {
          try { fs.unlinkSync(audioPath); } catch {}
        }
        return outputPath;
      } finally {
        localProcessingSemaphore.release();
      }
    }
    case 'attach-video': {
      await localProcessingSemaphore.acquire();
      try {
        const cfg = step.config as AttachVideoConfig;
        let clipUrl: string | undefined;
        let clipIsLocal = false;
        if (cfg.sourceStepId && stepOutputs.has(cfg.sourceStepId)) {
          clipUrl = stepOutputs.get(cfg.sourceStepId);
          clipIsLocal = true;
        } else if (cfg.tiktokUrl) {
          const rapidApiKey = config.RAPIDAPI_KEY;
          if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');
          clipUrl = await getVideoDownloadUrl(cfg.tiktokUrl, rapidApiKey);
        } else {
          clipUrl = cfg.videoUrl;
        }
        if (!clipUrl) throw new Error('No video source for attach step');
        let attachPath: string;
        if (clipIsLocal) {
          attachPath = clipUrl;
        } else {
          attachPath = path.join(tempDir, `tpl-attach-${stepIndex}-${jobId}-${Date.now()}.mp4`);
          await downloadToLocal(clipUrl, attachPath);
        }
        let musicedClipPath: string | undefined;
        if (inlineMusic) {
          musicedClipPath = await applyInlineMusic(attachPath, inlineMusic, stepIndex, jobId);
          attachPath = musicedClipPath;
        }
        const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-${jobId}-${Date.now()}.mp4`);
        const videoPaths = cfg.position === 'before'
          ? [attachPath, currentVideoPath]
          : [currentVideoPath, attachPath];
        try {
          concatVideos(videoPaths, outputPath);
        } finally {
          if (!clipIsLocal) {
            try { fs.unlinkSync(attachPath); } catch {}
          }
          if (musicedClipPath) {
            try { fs.unlinkSync(musicedClipPath); } catch {}
          }
        }
        return outputPath;
      } finally {
        localProcessingSemaphore.release();
      }
    }
    case 'compose': {
      await localProcessingSemaphore.acquire();
      try {
        const cfg = step.config as ComposeConfig;
        if (!cfg.layers || cfg.layers.length === 0) {
          throw new Error('Compose step has no layers');
        }
        const layerPaths = new Map<string, string>();
        const downloadedPaths: string[] = [];
        try {
          for (const layer of cfg.layers) {
            const src = layer.source;
            let localPath: string;
            if (src.type === 'step-output' && src.stepId && stepOutputs.has(src.stepId)) {
              localPath = stepOutputs.get(src.stepId)!;
            } else {
              const url = src.gcsUrl || src.url;
              if (!url) throw new Error(`No URL for compose layer ${layer.id}`);
              localPath = path.join(tempDir, `tpl-compose-${layer.id}-${Date.now()}.${layer.type === 'video' ? 'mp4' : 'png'}`);
              await downloadToLocal(url, localPath);
              downloadedPaths.push(localPath);
            }
            layerPaths.set(layer.id, localPath);
          }
          const outputPath = path.join(tempDir, `tpl-step-${stepIndex}-compose-${Date.now()}.mp4`);
          composeMedia(layerPaths, cfg, outputPath);
          return outputPath;
        } finally {
          for (const p of downloadedPaths) {
            try { fs.unlinkSync(p); } catch {}
          }
        }
      } finally {
        localProcessingSemaphore.release();
      }
    }
    case 'carousel': {
      await localProcessingSemaphore.acquire();
      try {
        const cfg = step.config as CarouselConfig;
        if (!cfg.images || cfg.images.length === 0) {
          throw new Error('Carousel step has no images');
        }
        const localPaths: string[] = [];
        for (let imgIdx = 0; imgIdx < cfg.images.length; imgIdx++) {
          const entry = cfg.images[imgIdx];
          const url = entry.imageUrl;
          if (!url) throw new Error(`Carousel image ${imgIdx} has no URL`);
          const ext = path.extname(url.split('?')[0]) || '.jpg';
          const localPath = path.join(tempDir, `tpl-carousel-${stepIndex}-${imgIdx}-${jobId}-${Date.now()}${ext}`);
          await downloadToLocal(url, localPath);
          localPaths.push(localPath);
        }
        return localPaths;
      } finally {
        localProcessingSemaphore.release();
      }
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
  const inlineMusicTrackPaths: string[] = []; // BG music tracks downloaded for inline application
  try {
    await updateTemplateJob(jobId, { status: 'processing', step: 'Starting pipeline...' });
    if (job.tiktokUrl && job.videoSource !== 'upload') {
      await updateTemplateJob(jobId, { step: 'Fetching video...' });
      const rapidApiKey = config.RAPIDAPI_KEY;
      if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');
      const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
      await updateTemplateJob(jobId, { step: 'Downloading and storing video...' });
      const tempPath = path.join(tempDir, `tpl-source-${jobId}-${Date.now()}.mp4`);
      try {
        await downloadFile(playUrl, tempPath);
        const { url: gcsUrl } = await uploadVideoFromPath(tempPath, `tpl-source-${jobId}.mp4`);
        await updateTemplateJob(jobId, { videoUrl: gcsUrl, videoSource: 'upload' });
        job.videoUrl = gcsUrl;
        job.videoSource = 'upload';
        console.log(`[Template] Video stored in GCS: ${gcsUrl.slice(0, 80)}...`);
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }
    let currentVideoPath: string;
    const enabledSteps = job.pipeline.filter((s: MiniAppStep) => s.enabled);
    const firstStep = enabledSteps[0];
    if (firstStep?.type === 'video-generation' && (firstStep.config as VideoGenConfig).mode === 'subtle-animation') {
      currentVideoPath = '';
    } else if (firstStep?.type === 'compose') {
      currentVideoPath = ''; // compose step has its own inputs
    } else if (firstStep?.type === 'carousel') {
      currentVideoPath = ''; // carousel step collects its own images
    } else if (job.videoSource === 'upload' && job.videoUrl) {
      await updateTemplateJob(jobId, { step: 'Downloading video...' });
      currentVideoPath = path.join(tempDir, `tpl-input-${jobId}-${Date.now()}.mp4`);
      await downloadToLocal(job.videoUrl, currentVideoPath);
      tempFiles.push(currentVideoPath);
    } else {
      throw new Error('No video source provided');
    }
    const inlineMusicMap = new Map<string, { config: BgMusicConfig; trackPath: string }>();
    const inlineMusicSkipSet = new Set<string>(); // BG music step IDs to skip (already applied inline)
    for (const s of enabledSteps) {
      if (s.type === 'bg-music') {
        const bgCfg = s.config as BgMusicConfig;
        if (bgCfg.applyToSteps && bgCfg.applyToSteps.length > 0) {
          const trackUrl = bgCfg.customTrackUrl || bgCfg.trackId;
          if (trackUrl) {
            const trackPath = path.join(tempDir, `tpl-inline-audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`);
            try {
              await downloadToLocal(trackUrl, trackPath);
              inlineMusicTrackPaths.push(trackPath);
              for (const targetId of bgCfg.applyToSteps) {
                const stepAudioMode = bgCfg.audioModePerStep?.[targetId] ?? 'mix';
                inlineMusicMap.set(targetId, {
                  config: { ...bgCfg, audioMode: stepAudioMode },
                  trackPath,
                });
              }
              inlineMusicSkipSet.add(s.id);
            } catch (e) {
              console.error(`[Template] Failed to download inline music track:`, e);
            }
          }
        }
      }
    }
    const stepOutputs = new Map<string, string>();
    const stepResults: { stepId: string; type: string; label: string; outputUrl: string; outputUrls?: string[]; isCarousel?: boolean }[] = [];
    let carouselImagePaths: string[] | null = null;
    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      const stepLabel = getStepLabel(step);
      if (inlineMusicSkipSet.has(step.id)) {
        continue;
      }
      await updateTemplateJob(jobId, {
        currentStep: i,
        step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel}`,
      });
      const inlineMusic = inlineMusicMap.get(step.id);
      const result = await processStep(step, currentVideoPath, jobId, i, stepOutputs, inlineMusic, carouselImagePaths);

      if (Array.isArray(result)) {
        // Carousel result: array of local image paths
        // Clean up previous carousel paths
        if (carouselImagePaths) {
          for (const p of carouselImagePaths) { try { fs.unlinkSync(p); } catch {} }
        }
        carouselImagePaths = result;
        tempFiles.push(...result);

        // Upload all images and store as carousel step result
        const uploadedUrls: string[] = [];
        for (let imgIdx = 0; imgIdx < result.length; imgIdx++) {
          const ext = path.extname(result[imgIdx]) || '.jpg';
          const { url } = await uploadVideoFromPath(result[imgIdx], `template-${jobId}-step-${i}-img-${imgIdx}${ext}`);
          uploadedUrls.push(url);
        }
        stepResults.push({
          stepId: step.id, type: step.type, label: stepLabel,
          outputUrl: uploadedUrls[0],
          outputUrls: uploadedUrls,
          isCarousel: true,
        });
      } else {
        let newVideoPath = result;
        if (inlineMusic && step.type !== 'attach-video') {
          const musicedPath = await applyInlineMusic(newVideoPath, inlineMusic, i, jobId);
          try { fs.unlinkSync(newVideoPath); } catch {}
          newVideoPath = musicedPath;
          tempFiles.push(musicedPath);
        }
        stepOutputs.set(step.id, newVideoPath);
        const { url: stepUrl } = await uploadVideoFromPath(
          newVideoPath,
          `template-${jobId}-step-${i}.mp4`
        );
        stepResults.push({ stepId: step.id, type: step.type, label: stepLabel, outputUrl: stepUrl });
        if (currentVideoPath && i > 0) {
          try { fs.unlinkSync(currentVideoPath); } catch {}
        }
        currentVideoPath = newVideoPath;
        tempFiles.push(newVideoPath);
      }
      await updateTemplateJob(jobId, {
        currentStep: i + 1,
        step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel} — done`,
        stepResults,
      });
    }
    // Determine final output URL
    const lastResult = stepResults[stepResults.length - 1];
    let finalUrl: string;
    if (lastResult?.isCarousel && lastResult.outputUrls) {
      finalUrl = `carousel:${JSON.stringify(lastResult.outputUrls)}`;
    } else if (stepResults.length > 0) {
      finalUrl = lastResult.outputUrl;
    } else {
      finalUrl = (await uploadVideoFromPath(currentVideoPath, `template-${jobId}.mp4`)).url;
    }
    await updateTemplateJob(jobId, {
      status: 'completed',
      step: 'Done!',
      outputUrl: finalUrl,
      stepResults,
      completedAt: new Date().toISOString(),
    });
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
    const failedJob = await getTemplateJob(jobId);
    if (failedJob?.pipelineBatchId) {
      try {
        await updatePipelineBatchProgress(failedJob.pipelineBatchId);
      } catch (e) {
        console.error('Failed to update pipeline batch progress:', e);
      }
    }
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    for (const f of inlineMusicTrackPaths) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}
export function getStepLabel(step: MiniAppStep): string {
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
    case 'compose':
      return 'Composing media layers';
    case 'carousel':
      return 'Collecting carousel images';
    default:
      return 'Processing';
  }
}
/**
 * Get the base URL for internal API calls.
 * Works on Vercel (APP_URL / VERCEL_URL) and local dev (localhost:3000).
 */
function getInternalBaseUrl(): string {
  if (config.APP_URL) return config.APP_URL;
  return `http://localhost:${process.env.PORT || 3000}`;
}

/**
 * Trigger a single template job's processing via an internal API call.
 * Each call creates a separate serverless invocation with its own timeout,
 * preventing queue starvation when processing large batches.
 */
async function triggerJobProcessing(jobId: string, baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/templates/${jobId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.error(`[PipelineBatch] Failed to trigger job ${jobId}: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[PipelineBatch] Error triggering job ${jobId}:`, err);
  }
}

/**
 * Process a pipeline batch: resolve the social URL ONCE, upload the video
 * to stable storage, then trigger all child jobs via internal API calls.
 *
 * Each job is triggered as a separate serverless invocation (via POST to
 * /api/templates/[id]/process) so each gets its own 5-minute timeout.
 * Jobs are staggered in chunks to avoid overwhelming the FAL API.
 *
 * This replaces the old approach of processing all jobs in the same
 * function, which caused queue starvation when the function timed out
 * after only 1-2 chunks of 5.
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
      console.log(`[PipelineBatch] Resolving video URL once for ${childJobIds.length} jobs: ${tiktokUrl}`);
      const rapidApiKey = config.RAPIDAPI_KEY;
      if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');
      const playUrl = await getVideoDownloadUrl(tiktokUrl, rapidApiKey);
      sharedVideoPath = path.join(tempDir, `pipeline-batch-input-${Date.now()}.mp4`);
      await downloadFile(playUrl, sharedVideoPath);
      const { url: stableUrl } = await uploadVideoFromPath(
        sharedVideoPath,
        `pipeline-batch-input-${Date.now()}.mp4`
      );
      console.log(`[PipelineBatch] Video uploaded to stable storage: ${stableUrl.slice(0, 80)}...`);
      for (const jobId of childJobIds) {
        await updateTemplateJob(jobId, { videoUrl: stableUrl, videoSource: 'upload' });
      }
    }

    const baseUrl = getInternalBaseUrl();
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY_MS = 2000; // 2s between chunks to stagger FAL submissions

    console.log(`[PipelineBatch] Triggering ${childJobIds.length} jobs via internal API (base: ${baseUrl})`);

    for (let i = 0; i < childJobIds.length; i += CHUNK_SIZE) {
      const chunk = childJobIds.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(childJobIds.length / CHUNK_SIZE);
      console.log(`[PipelineBatch] Triggering chunk ${chunkNum}/${totalChunks} (jobs ${i + 1}-${i + chunk.length} of ${childJobIds.length})`);

      // Fire all jobs in this chunk concurrently — each gets its own serverless invocation
      await Promise.allSettled(
        chunk.map((id) => triggerJobProcessing(id, baseUrl))
      );

      // Small delay between chunks to stagger FAL API submissions
      if (i + CHUNK_SIZE < childJobIds.length) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      }
    }

    console.log(`[PipelineBatch] All ${childJobIds.length} jobs triggered successfully`);
  } finally {
    if (sharedVideoPath) {
      try { fs.unlinkSync(sharedVideoPath); } catch {}
    }
  }
}
