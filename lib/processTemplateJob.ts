import path from 'path';
import fs from 'fs';
import { fal } from '@fal-ai/client';
import { getTemplateJob, updateTemplateJob, getModelImage, updatePipelineBatchProgress } from '@/lib/db';
import { createGenerationRequest } from '@/lib/db-generation-requests';
import { getEndpointCost } from '@/lib/fal-pricing';
import { uploadVideoFromPath, downloadToBuffer as gcsDownloadToBuffer } from '@/lib/storage';
import { downloadFile, getVideoDuration, trimVideo, trimVideoRange } from '@/lib/serverUtils';
import { addTextOverlay, mixAudio, concatVideos, stripAudio } from '@/lib/ffmpegOps';
import { composeMedia } from '@/lib/ffmpegCompose';
import { config, getFalWebhookUrl } from '@/lib/config';
import { getVideoDownloadUrl } from '@/lib/processJob';
import { uploadBuffer } from '@/lib/upload-via-presigned.js';
import { addTextOverlayToImage } from '@/lib/imageTextOverlay';
import { RateLimiter } from '@/lib/rateLimiter';
import { isRetryableError, retry } from '@/lib/retry';
import { canFinalizeTemplateJobFromPersistedSteps, getFinalTemplateJobOutputUrl } from '@/lib/templateJobFinalization';
import { cleanupTempWorkspace, createTempWorkspace } from '@/lib/tempWorkspace';
import type { MiniAppStep, VideoGenConfig, BatchVideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig, ComposeConfig, CarouselConfig } from '@/types';

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
type LoadedTemplateJob = NonNullable<Awaited<ReturnType<typeof getTemplateJob>>>;

async function withTemplateJobRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return retry(fn, {
    retries: 3,
    delaysMs: [1000, 3000, 7000],
    onRetry: (error, attempt, delayMs) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TemplateRetry] ${label} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${message}`);
    },
  });
}

function firstStepNeedsInputVideo(step: MiniAppStep | undefined): boolean {
  if (!step) return false;
  if (step.type === 'video-generation') {
    return (step.config as VideoGenConfig).mode !== 'subtle-animation';
  }
  if (step.type === 'batch-video-generation') {
    return (step.config as BatchVideoGenConfig).mode !== 'subtle-animation';
  }
  return step.type !== 'compose' && step.type !== 'carousel';
}

function pipelineReferencesSourceVideo(steps: MiniAppStep[]): boolean {
  return steps.some((step) => {
    if (!step.enabled || step.type !== 'compose') {
      return false;
    }
    const cfg = step.config as ComposeConfig;
    return Array.isArray(cfg.layers) && cfg.layers.some((layer) =>
      layer.source.type === 'step-output' && layer.source.stepId === '__video-source'
    );
  });
}

async function persistTemplateFalRequest(
  jobId: string,
  step: string,
  falRequestId: string,
  falEndpoint: string,
): Promise<void> {
  const updatedJob = await updateTemplateJob(jobId, {
    step,
    falRequestId,
    falEndpoint,
  });

  if (updatedJob?.falRequestId !== falRequestId || updatedJob?.falEndpoint !== falEndpoint) {
    throw new Error(`Submitted FAL request ${falRequestId} but failed to persist its recovery metadata.`);
  }
}

async function prepareSourceVideo(
  job: LoadedTemplateJob,
  jobId: string,
  enabledSteps: MiniAppStep[],
  tempDir: string,
  tempFiles: string[],
): Promise<{ initialVideoPath: string; sourceVideoPath: string | null }> {
  if (job.videoSource !== 'upload' || !job.videoUrl) {
    return { initialVideoPath: '', sourceVideoPath: null };
  }

  const firstStep = enabledSteps[0];
  const shouldUseAsInitialVideo = firstStepNeedsInputVideo(firstStep);
  const shouldPrepareSource =
    shouldUseAsInitialVideo ||
    pipelineReferencesSourceVideo(enabledSteps) ||
    (typeof job.sourceTrimStart === 'number' && typeof job.sourceTrimEnd === 'number');

  if (!shouldPrepareSource) {
    return { initialVideoPath: '', sourceVideoPath: null };
  }

  try {
    await updateTemplateJob(jobId, { step: 'Downloading video...' });
  } catch {}

  const downloadedSourcePath = path.join(tempDir, `tpl-input-${jobId}-${Date.now()}.mp4`);
  await downloadToLocal(job.videoUrl, downloadedSourcePath);
  tempFiles.push(downloadedSourcePath);

  let preparedSourcePath = downloadedSourcePath;
  if (
    typeof job.sourceTrimStart === 'number' &&
    typeof job.sourceTrimEnd === 'number'
  ) {
    const inputDuration = getVideoDuration(downloadedSourcePath);
    const trimStart = Math.max(0, Math.min(job.sourceTrimStart, Math.max(0, inputDuration - 0.05)));
    const trimEnd = Math.min(inputDuration, Math.max(job.sourceTrimEnd, trimStart + 0.05));

    if (trimEnd <= trimStart + 0.05) {
      throw new Error('Invalid source trim range');
    }

    const shouldTrimSource = trimStart > 0.05 || trimEnd < inputDuration - 0.05;
    if (shouldTrimSource) {
      try {
        await updateTemplateJob(jobId, { step: 'Applying source trim...' });
      } catch {}
      const trimmedSourcePath = path.join(tempDir, `tpl-source-trim-${jobId}-${Date.now()}.mp4`);
      trimVideoRange(downloadedSourcePath, trimmedSourcePath, trimStart, trimEnd);
      tempFiles.push(trimmedSourcePath);
      preparedSourcePath = trimmedSourcePath;
    }
  }

  return {
    initialVideoPath: shouldUseAsInitialVideo ? preparedSourcePath : '',
    sourceVideoPath: preparedSourcePath,
  };
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
async function uploadImageToFal(imageUrl: string, jobId: string, tempDir: string): Promise<string> {
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
    const tempPath = path.join(tempDir, `img-${jobId}-${Date.now()}.png`);
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
  tempDir: string,
  stepIndex: number,
  jobId?: string,
): Promise<string> {
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
  tempDir: string,
  stepOutputs: Map<string, string>,
  inlineMusic?: { config: BgMusicConfig; trackPath: string },
  carouselImagePaths?: string[] | null,
): Promise<string | string[]> {
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
      const falImageUrl = await uploadImageToFal(imageUrl, jobId, tempDir);
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
        await persistTemplateFalRequest(
          jobId,
          `Step ${stepIndex + 1}: Veo 3.1 — generating...`,
          request_id,
          falEndpoint,
        );
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
        await persistTemplateFalRequest(
          jobId,
          `Step ${stepIndex + 1}: Motion Control — processing...`,
          request_id,
          falEndpoint,
        );
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

        // Track video generation cost
        try {
          const videoDuration = getVideoDuration(outputPath);
          const videoCost = await getEndpointCost(falEndpoint, videoDuration);
          // Look up who created the job so we can attribute the cost
          const jobRecord = await getTemplateJob(jobId);
          await createGenerationRequest({
            type: 'video',
            provider: 'fal',
            model: falEndpoint,
            status: 'success',
            cost: videoCost,
            durationSeconds: videoDuration,
            metadata: { jobId, stepIndex },
            createdBy: jobRecord?.createdBy || null,
          });
        } catch (costErr) {
          console.error('[CostTracking] Failed to track video cost:', costErr);
        }

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
          musicedClipPath = await applyInlineMusic(attachPath, inlineMusic, tempDir, stepIndex, jobId);
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
 * If fromStepIndex is provided, reuses prior step results and resumes from that step.
 */
export async function processTemplateJob(jobId: string, fromStepIndex?: number): Promise<void> {
  let job: Awaited<ReturnType<typeof getTemplateJob>> | null = null;
  let completionOutputUrl: string | null = null;
  const tempDir = createTempWorkspace(`template-${jobId}`);
  const tempFiles: string[] = [];
  const inlineMusicTrackPaths: string[] = []; // BG music tracks downloaded for inline application
  const resuming = typeof fromStepIndex === 'number' && fromStepIndex > 0;
  try {
    job = await withTemplateJobRetry(`load job ${jobId}`, () => getTemplateJob(jobId));
    if (!job) return;

    try {
      await updateTemplateJob(jobId, { status: 'processing', step: resuming ? `Resuming from step ${fromStepIndex + 1}...` : 'Starting pipeline...' });
    } catch (statusErr) {
      console.error(`[Template] Non-fatal: failed to set processing status for ${jobId}:`, statusErr instanceof Error ? statusErr.message : statusErr);
    }

    const enabledSteps = job.pipeline.filter((s: MiniAppStep) => s.enabled);
    if (canFinalizeTemplateJobFromPersistedSteps(job.currentStep, enabledSteps.length, job.stepResults)) {
      const persistedOutputUrl = getFinalTemplateJobOutputUrl(job.stepResults);
      if (!persistedOutputUrl) {
        throw new Error(`Job ${jobId} has all step results but no final output URL`);
      }

      await updateTemplateJob(jobId, {
        status: 'completed',
        step: 'Done!',
        outputUrl: persistedOutputUrl,
        completedAt: job.completedAt ?? new Date(),
      });

      if (job.pipelineBatchId) {
        try {
          await updatePipelineBatchProgress(job.pipelineBatchId);
        } catch (e) {
          console.error('Failed to update pipeline batch progress:', e);
        }
      }
      return;
    }

    // ── Resume support: restore prior results and download the input video ──
    let currentVideoPath: string = '';
    const stepOutputs = new Map<string, string>();
    const stepResults: { stepId: string; type: string; label: string; outputUrl: string; outputUrls?: string[]; isCarousel?: boolean }[] = [];
    let carouselImagePaths: string[] | null = null;

    if (resuming) {
      // Restore step results from prior steps
      const existingResults = job.stepResults || [];
      const priorStepIds = new Set(enabledSteps.slice(0, fromStepIndex).map((s: MiniAppStep) => s.id));
      for (const sr of existingResults) {
        if (priorStepIds.has(sr.stepId)) {
          stepResults.push(sr);
        }
      }

      // Download the output from the step before fromStepIndex as our starting video
      const prevResult = stepResults[stepResults.length - 1];
      if (prevResult) {
        if (prevResult.isCarousel && prevResult.outputUrls) {
          // Restore carousel image paths
          carouselImagePaths = [];
          for (let imgIdx = 0; imgIdx < prevResult.outputUrls.length; imgIdx++) {
            const ext = path.extname(prevResult.outputUrls[imgIdx]) || '.jpg';
            const localPath = path.join(tempDir, `tpl-resume-carousel-${imgIdx}-${jobId}-${Date.now()}${ext}`);
            await downloadToLocal(prevResult.outputUrls[imgIdx], localPath);
            carouselImagePaths.push(localPath);
            tempFiles.push(localPath);
          }
        } else {
          currentVideoPath = path.join(tempDir, `tpl-resume-${jobId}-${Date.now()}.mp4`);
          await downloadToLocal(prevResult.outputUrl, currentVideoPath);
          tempFiles.push(currentVideoPath);
        }

        // Pre-populate stepOutputs so attach-video/compose can reference prior steps
        for (const sr of stepResults) {
          if (!sr.isCarousel) {
            const localPath = path.join(tempDir, `tpl-resume-stepout-${sr.stepId}-${Date.now()}.mp4`);
            // Only download if different from currentVideoPath source
            if (sr.stepId !== prevResult.stepId) {
              await downloadToLocal(sr.outputUrl, localPath);
              tempFiles.push(localPath);
            } else {
              // Reuse the already-downloaded file
              stepOutputs.set(sr.stepId, currentVideoPath);
              continue;
            }
            stepOutputs.set(sr.stepId, localPath);
          }
        }
      }
      const { sourceVideoPath } = await prepareSourceVideo(job, jobId, enabledSteps, tempDir, tempFiles);
      if (sourceVideoPath) {
        stepOutputs.set('__video-source', sourceVideoPath);
      }
      console.log(`[Template] Resuming job ${jobId} from step ${fromStepIndex}, restored ${stepResults.length} prior results`);
    } else {
      // ── Normal full processing ──
      if (job.tiktokUrl && job.videoSource !== 'upload') {
        try { await updateTemplateJob(jobId, { step: 'Fetching video...' }); } catch {}
        const rapidApiKey = config.RAPIDAPI_KEY;
        if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');
        const playUrl = await getVideoDownloadUrl(job.tiktokUrl, rapidApiKey);
        try { await updateTemplateJob(jobId, { step: 'Downloading and storing video...' }); } catch {}
        const tempPath = path.join(tempDir, `tpl-source-${jobId}-${Date.now()}.mp4`);
        try {
          await downloadFile(playUrl, tempPath);
          const { url: gcsUrl } = await uploadVideoFromPath(tempPath, `tpl-source-${jobId}.mp4`);
          try { await updateTemplateJob(jobId, { videoUrl: gcsUrl, videoSource: 'upload' }); } catch (e) {
            console.error(`[Template] Non-fatal: failed to persist video URL for ${jobId}:`, e instanceof Error ? e.message : e);
          }
          job.videoUrl = gcsUrl;
          job.videoSource = 'upload';
          console.log(`[Template] Video stored in GCS: ${gcsUrl.slice(0, 80)}...`);
        } finally {
          try { fs.unlinkSync(tempPath); } catch {}
        }
      }

      const firstStep = enabledSteps[0];
      const { initialVideoPath, sourceVideoPath } = await prepareSourceVideo(job, jobId, enabledSteps, tempDir, tempFiles);
      if (sourceVideoPath) {
        stepOutputs.set('__video-source', sourceVideoPath);
      }

      if (firstStep?.type === 'video-generation' && (firstStep.config as VideoGenConfig).mode === 'subtle-animation') {
        currentVideoPath = '';
      } else if (firstStep?.type === 'compose') {
        currentVideoPath = '';
      } else if (firstStep?.type === 'carousel') {
        currentVideoPath = '';
      } else if (initialVideoPath) {
        currentVideoPath = initialVideoPath;
      } else {
        throw new Error('No video source provided');
      }
    }

    // ── Inline music setup (always runs for full step list) ──
    const inlineMusicMap = new Map<string, { config: BgMusicConfig; trackPath: string }>();
    const inlineMusicSkipSet = new Set<string>();
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

    // ── Main step loop (starts from fromStepIndex if resuming) ──
    const startIdx = fromStepIndex ?? 0;
    for (let i = startIdx; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      const stepLabel = getStepLabel(step);
      if (inlineMusicSkipSet.has(step.id)) {
        continue;
      }
      try {
        await updateTemplateJob(jobId, {
          currentStep: i,
          step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel}`,
        });
      } catch (progressErr) {
        console.error(`[Template] Non-fatal: failed to update progress for step ${i}:`, progressErr instanceof Error ? progressErr.message : progressErr);
      }
      const inlineMusic = inlineMusicMap.get(step.id);
      const result = await processStep(step, currentVideoPath, jobId, i, tempDir, stepOutputs, inlineMusic, carouselImagePaths);

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
          const musicedPath = await applyInlineMusic(newVideoPath, inlineMusic, tempDir, i, jobId);
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
      try {
        await updateTemplateJob(jobId, {
          currentStep: i + 1,
          step: `Step ${i + 1}/${enabledSteps.length}: ${stepLabel} — done`,
          stepResults,
        });
      } catch (progressErr) {
        console.error(`[Template] Non-fatal: failed to update progress after step ${i}:`, progressErr instanceof Error ? progressErr.message : progressErr);
      }
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
    completionOutputUrl = finalUrl;
    await updateTemplateJob(jobId, {
      status: 'completed',
      step: 'Done!',
      outputUrl: finalUrl,
      completedAt: new Date(),
    });
    if (job.pipelineBatchId) {
      try {
        await updatePipelineBatchProgress(job.pipelineBatchId);
      } catch (e) {
        console.error('Failed to update pipeline batch progress:', e);
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCause = error instanceof Error && error.cause ? ` | cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}` : '';
    console.error(`[Template] Job ${jobId} failed: ${errMsg}${errCause}`);
    if (completionOutputUrl) {
      try {
        await updateTemplateJob(jobId, {
          status: 'completed',
          step: 'Done!',
          outputUrl: completionOutputUrl,
          completedAt: new Date(),
        });
        if (job?.pipelineBatchId) {
          try {
            await updatePipelineBatchProgress(job.pipelineBatchId);
          } catch (e) {
            console.error('Failed to update pipeline batch progress:', e);
          }
        }
        return;
      } catch (finalizeErr) {
        console.error(`[Template] Fallback completion failed for ${jobId}:`, finalizeErr);
      }
    }
    try {
      await updateTemplateJob(jobId, {
        status: 'failed',
        step: 'Failed',
        error: errMsg + errCause,
      });
    } catch (updateErr) {
      console.error(`[Template] Failed to mark job ${jobId} as failed:`, updateErr);
    }
    try {
      const failedJob = job ?? await withTemplateJobRetry(`reload failed job ${jobId}`, () => getTemplateJob(jobId));
      if (failedJob?.pipelineBatchId) {
        try {
          await updatePipelineBatchProgress(failedJob.pipelineBatchId);
        } catch (e) {
          console.error('Failed to update pipeline batch progress:', e);
        }
      }
    } catch (fetchErr) {
      console.error(`[Template] Failed to fetch job ${jobId} for batch progress:`, fetchErr);
    }
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    for (const f of inlineMusicTrackPaths) {
      try { fs.unlinkSync(f); } catch {}
    }
    cleanupTempWorkspace(tempDir);
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
async function triggerJobProcessing(jobId: string, baseUrl: string): Promise<boolean> {
  try {
    await retry(async () => {
      const res = await fetch(`${baseUrl}/api/templates/${jobId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return;
      }

      const statusText = `${res.status} ${res.statusText}`.trim();
      const bodyText = (await res.text().catch(() => '')).slice(0, 300);
      const details = bodyText ? ` ${bodyText}` : '';

      if (res.status === 408 || res.status === 409 || res.status === 425 || res.status === 429 || res.status >= 500) {
        if (res.status === 429) {
          throw new Error(`Too many requests triggering job ${jobId}: ${statusText}${details}`);
        }
        throw new Error(`Service unavailable triggering job ${jobId}: ${statusText}${details}`);
      }

      throw new Error(`Non-retryable trigger failure for job ${jobId}: ${statusText}${details}`);
    }, {
      retries: config.pipelineBatchTriggerRetryCount,
      delaysMs: Array.from(
        { length: Math.max(config.pipelineBatchTriggerRetryCount, 1) },
        (_, attempt) => config.pipelineBatchTriggerRetryDelayMs * (attempt + 1),
      ),
      shouldRetry: (error) => isRetryableError(error),
      onRetry: (error, attempt, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[PipelineBatch] Trigger retry for ${jobId} (attempt ${attempt}) in ${delayMs}ms: ${message}`);
      },
    });
    return true;
  } catch (err) {
    console.error(`[PipelineBatch] Error triggering job ${jobId}:`, err);
    return false;
  }
}

async function triggerJobsWithThrottle(jobIds: string[], baseUrl: string): Promise<{ succeeded: number; failed: number }> {
  if (jobIds.length === 0) return { succeeded: 0, failed: 0 };

  const concurrency = Math.min(config.pipelineBatchTriggerConcurrency, jobIds.length);
  const launchRatePerSecond = config.pipelineBatchTriggerRatePerSecond;
  const launchLimiter = new RateLimiter(launchRatePerSecond);
  let nextIndex = 0;
  let triggeredCount = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(
    `[PipelineBatch] Triggering ${jobIds.length} jobs with concurrency=${concurrency}, ` +
    `launchRate=${launchRatePerSecond}/s`
  );

  const workers = Array.from({ length: concurrency }, (_, workerIndex) => (async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= jobIds.length) {
        return;
      }

      const jobId = jobIds[currentIndex];
      await launchLimiter.acquire();
      const ok = await triggerJobProcessing(jobId, baseUrl);
      triggeredCount++;
      if (ok) succeeded++;
      else failed++;

      if (
        triggeredCount === jobIds.length ||
        triggeredCount % Math.max(5, Math.ceil(launchRatePerSecond)) === 0
      ) {
        console.log(
          `[PipelineBatch] Triggered ${triggeredCount}/${jobIds.length} jobs ` +
          `(worker ${workerIndex + 1}, latest job ${jobId})`
        );
      }
    }
  })());

  await Promise.allSettled(workers);
  return { succeeded, failed };
}

/**
 * Process a pipeline batch: resolve the social URL ONCE, upload the video
 * to stable storage, then trigger all child jobs via internal API calls.
 *
 * Each job is triggered as a separate serverless invocation (via POST to
 * /api/templates/[id]/process) so each gets its own 5-minute timeout.
 * Launches are paced with a rate limiter and bounded concurrency so large
 * batches start quickly without sending an uncontrolled spike of requests.
 *
 * This replaces the old approach of processing all jobs in the same
 * function, which caused queue starvation when the function timed out
 * after only a few child jobs were launched.
 */
export async function processPipelineBatch(
  childJobIds: string[],
  tiktokUrl: string | null,
  videoUrl: string | null,
): Promise<void> {
  const tempDir = createTempWorkspace(`pipeline-batch-${childJobIds[0] || 'shared'}`);
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
        try {
          await updateTemplateJob(jobId, { videoUrl: stableUrl, videoSource: 'upload' });
        } catch (e) {
          console.error(`[PipelineBatch] Non-fatal: failed to set videoUrl for child job ${jobId}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    const baseUrl = getInternalBaseUrl();
    const { succeeded, failed } = await triggerJobsWithThrottle(childJobIds, baseUrl);

    console.log(`[PipelineBatch] Trigger summary: ${succeeded} succeeded, ${failed} failed out of ${childJobIds.length}`);
  } finally {
    if (sharedVideoPath) {
      try { fs.unlinkSync(sharedVideoPath); } catch {}
    }
    cleanupTempWorkspace(tempDir);
  }
}
