import type { ModelImage, VideoGenConfig as VGC } from '@/types';
import type { FirstFrameOption, ImageSource } from './types';
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

export async function generateAllMasterFirstFrames(params: {
  masterModels: MasterModel[];
  generateForModel: (modelId: string, primaryGcsUrl: string) => Promise<FirstFrameOption[] | null>;
  onModelResult?: (modelId: string, images: FirstFrameOption[]) => void;
  onModelError?: (modelId: string, error: string) => void;
  onProgress: (done: number, total: number) => void;
  frameImageUrl?: string;
  resolution?: string;
  provider?: string;
}) {
  const { masterModels, generateForModel, onModelResult, onModelError, onProgress, frameImageUrl, resolution, provider } = params;
  const total = masterModels.length;
  onProgress(0, total);

  // Try batch endpoint — single HTTP request, all models processed server-side in parallel
  if (frameImageUrl && onModelResult) {
    try {
      const res = await fetch('/api/generate-first-frame/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: masterModels.map((m) => ({ modelImageUrl: m.primaryGcsUrl, modelId: m.modelId })),
          frameImageUrl,
          resolution: resolution || '1K',
          provider: provider || 'gemini',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const results: { modelId?: string; images: FirstFrameOption[]; error?: string }[] = data.results || [];

        let done = 0;
        for (const result of results) {
          if (result.modelId && result.images.length > 0) {
            onModelResult(result.modelId, result.images);
          } else if (result.modelId && result.error) {
            onModelError?.(result.modelId, result.error);
          }
          done += 1;
          onProgress(Math.min(done, total), total);
        }
        return;
      }
      console.warn('[FirstFrame] Batch endpoint failed, falling back to individual requests');
    } catch (err) {
      console.warn('[FirstFrame] Batch endpoint error, falling back:', (err as Error).message);
    }
  }

  // Fallback: fire all individual requests in parallel (browser limits to ~6 concurrent)
  let done = 0;
  const promises = masterModels.map((model) =>
    generateForModel(model.modelId, model.primaryGcsUrl).then(() => {
      done += 1;
      onProgress(Math.min(done, total), total);
    }),
  );

  await Promise.all(promises);
}
