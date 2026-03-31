import type { ExtractedFrame, FirstFrameOption } from './types';

type UploadImageResult = {
  success?: boolean;
  url?: string;
  path?: string;
  gcsUrl?: string;
};

const FIRST_FRAME_MAX_ATTEMPTS = 3;
const FIRST_FRAME_RETRY_DELAYS_MS = [1000, 2500];
const RETRYABLE_FIRST_FRAME_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFirstFrameError(status: number | null, message: string) {
  if (status !== null && RETRYABLE_FIRST_FRAME_STATUS_CODES.has(status)) {
    return true;
  }

  const normalized = message.toLowerCase();
  return [
    'gemini returned no image data',
    'no image url returned from fal',
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'timeout',
    'timed out',
    'fetch failed',
    'network error',
    'network request failed',
    'internal server error',
    'service unavailable',
    'gateway timeout',
    'bad gateway',
    'overloaded',
    'try again',
  ].some((fragment) => normalized.includes(fragment));
}

export async function extractFramesFromVideo(videoUrl: string): Promise<ExtractedFrame[]> {
  const res = await fetch('/api/extract-frames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to extract frames');
  return data.frames || [];
}

export async function uploadImageFile(file: File): Promise<UploadImageResult> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  return res.json();
}

export async function generateFirstFrameRequest(params: {
  modelImageUrl: string;
  frameImageUrl: string;
  resolution: '1K' | '2K' | '4K';
  modelId?: string | null;
  provider?: 'gemini' | 'gemini-pro' | 'fal' | 'gpt-image';
}): Promise<FirstFrameOption[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FIRST_FRAME_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('/api/generate-first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, provider: params.provider ?? 'fal' }),
      });
      const data = await res.json();

      if (!res.ok) {
        const message = data.error || 'Failed to generate first frame';
        if (attempt < FIRST_FRAME_MAX_ATTEMPTS - 1 && isRetryableFirstFrameError(res.status, message)) {
          await delay(FIRST_FRAME_RETRY_DELAYS_MS[attempt] ?? FIRST_FRAME_RETRY_DELAYS_MS[FIRST_FRAME_RETRY_DELAYS_MS.length - 1]);
          continue;
        }
        throw new Error(message);
      }

      return data.images || [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to generate first frame');
      lastError = err;
      if (attempt < FIRST_FRAME_MAX_ATTEMPTS - 1 && isRetryableFirstFrameError(null, err.message)) {
        await delay(FIRST_FRAME_RETRY_DELAYS_MS[attempt] ?? FIRST_FRAME_RETRY_DELAYS_MS[FIRST_FRAME_RETRY_DELAYS_MS.length - 1]);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Failed to generate first frame');
}

export async function fetchGeneratedImages(params: { modelId?: string; limit?: number; page?: number }): Promise<{ images: unknown[]; total: number }> {
  const searchParams = new URLSearchParams({ signed: 'true' });
  if (params.modelId) searchParams.set('modelId', params.modelId);
  searchParams.set('limit', String(params.limit || 50));
  searchParams.set('page', String(params.page || 1));
  const res = await fetch(`/api/generated-images?${searchParams}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load images');
  return { images: data.images || [], total: data.total ?? 0 };
}
