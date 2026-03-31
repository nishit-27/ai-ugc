import type { ModelImage, VideoGenConfig as VGC } from '@/types';
import type { FirstFrameOption, ImageSource, QueueState } from './types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';

export function resolveModelImageDisplay(params: {
  imageSource: ImageSource;
  config: VGC;
  modelImages: ModelImage[];
  originalModelImageUrl: string | null;
}): string | null {
  const { imageSource, config, modelImages, originalModelImageUrl } = params;
  if (imageSource === 'model' && config.imageId) {
    const img = modelImages.find((m) => m.id === config.imageId);
    return img?.signedUrl || img?.gcsUrl || null;
  }
  if (imageSource === 'upload') {
    return originalModelImageUrl || config.imageUrl || null;
  }
  return null;
}

export function resolveModelImageUrl(params: {
  imageSource: ImageSource;
  config: VGC;
  modelImages: ModelImage[];
  originalModelImageUrl: string | null;
  uploadedGcsUrl: string | null;
}): string | null {
  const { imageSource, config, modelImages, originalModelImageUrl, uploadedGcsUrl } = params;
  if (imageSource === 'model' && config.imageId) {
    const img = modelImages.find((m) => m.id === config.imageId);
    return img?.gcsUrl || img?.signedUrl || null;
  }
  if (imageSource === 'upload') {
    return originalModelImageUrl || uploadedGcsUrl || config.imageUrl || null;
  }
  return null;
}

/** Max concurrent image generation requests to avoid rate limiting */
const CONCURRENCY_LIMIT = 2;
/** Delay in ms between launching each batch chunk */
const CHUNK_DELAY_MS = 1500;

export async function generateAllMasterFirstFrames(params: {
  masterModels: MasterModel[];
  generateForModel: (modelId: string, primaryGcsUrl: string) => Promise<FirstFrameOption[] | null>;
  onModelResult?: (modelId: string, images: FirstFrameOption[]) => void;
  onModelError?: (modelId: string, error: string) => void;
  onProgress: (done: number, total: number) => void;
  onQueueStateChange?: (state: QueueState) => void;
  frameImageUrl?: string;
  resolution?: string;
  provider?: string;
}) {
  const {
    masterModels, generateForModel, onModelResult, onModelError,
    onProgress, onQueueStateChange, frameImageUrl, resolution, provider,
  } = params;
  const total = masterModels.length;
  onProgress(0, total);

  // Initialize queue state — all models start as queued with position
  const queueState: QueueState = {};
  masterModels.forEach((m, i) => {
    queueState[m.modelId] = { status: 'queued', position: i + 1 };
  });
  onQueueStateChange?.({ ...queueState });

  // Process models in chunks with concurrency limit
  let done = 0;
  const chunks: MasterModel[][] = [];
  for (let i = 0; i < masterModels.length; i += CONCURRENCY_LIMIT) {
    chunks.push(masterModels.slice(i, i + CONCURRENCY_LIMIT));
  }

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];

    // Mark chunk models as generating
    for (const model of chunk) {
      queueState[model.modelId] = { status: 'generating' };
    }
    onQueueStateChange?.({ ...queueState });

    // Process chunk in parallel
    await Promise.allSettled(
      chunk.map(async (model) => {
        try {
          const res = await fetch('/api/generate-first-frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelImageUrl: model.primaryGcsUrl,
              frameImageUrl,
              resolution: resolution || '1K',
              modelId: model.modelId,
              provider: provider || 'gemini',
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            const error = data.error || `HTTP ${res.status}`;
            queueState[model.modelId] = { status: 'failed' };
            onModelError?.(model.modelId, error);
          } else {
            const images: FirstFrameOption[] = data.images || [];
            queueState[model.modelId] = { status: images.length > 0 ? 'done' : 'failed' };
            if (images.length > 0) {
              onModelResult?.(model.modelId, images);
            } else {
              onModelError?.(model.modelId, 'No images returned');
            }
          }
        } catch (err) {
          queueState[model.modelId] = { status: 'failed' };
          onModelError?.(model.modelId, (err as Error).message || 'Unknown error');
        }

        done += 1;
        onProgress(Math.min(done, total), total);
        onQueueStateChange?.({ ...queueState });
      }),
    );

    // Delay between chunks to avoid rate limiting (skip delay after last chunk)
    if (chunkIdx < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }
}
