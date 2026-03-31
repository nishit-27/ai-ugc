import type { ModelImage, VideoGenConfig as VGC } from '@/types';
import type { FirstFrameOption, ImageSource, QueueState } from './types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import { generateFirstFrameRequest } from './api';
import { runFirstFrameBatchQueue } from './batchQueue';

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
  onModelResult?: (modelId: string, images: FirstFrameOption[]) => void;
  onModelError?: (modelId: string, error: string) => void;
  onProgress: (done: number, total: number) => void;
  onQueueStateChange?: (state: QueueState) => void;
  frameImageUrl?: string;
  resolution?: '1K' | '2K' | '4K';
  provider?: 'gemini' | 'gemini-pro' | 'fal' | 'gpt-image';
}) {
  const {
    masterModels, onModelResult, onModelError,
    onProgress, onQueueStateChange, frameImageUrl, resolution, provider,
  } = params;
  const resolvedResolution: '1K' | '2K' | '4K' = resolution ?? '1K';
  const resolvedProvider: 'gemini' | 'gemini-pro' | 'fal' | 'gpt-image' = provider ?? 'fal';
  await runFirstFrameBatchQueue({
    items: masterModels,
    getId: (model) => model.modelId,
    onProgress,
    onQueueStateChange,
    worker: async (model) => {
      if (!frameImageUrl) {
        const error = 'No scene frame selected.';
        onModelError?.(model.modelId, error);
        throw new Error(error);
      }

      try {
        const images = await generateFirstFrameRequest({
          modelImageUrl: model.primaryGcsUrl,
          frameImageUrl,
          resolution: resolvedResolution,
          modelId: model.modelId,
          provider: resolvedProvider,
        });

        if (images.length === 0) {
          throw new Error('No images returned');
        }

        onModelResult?.(model.modelId, images);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        onModelError?.(model.modelId, message);
        throw error;
      }
    },
  });
}
