import type { ExtractedFrame, FirstFrameOption } from './types';

type UploadImageResult = {
  success?: boolean;
  url?: string;
  path?: string;
  gcsUrl?: string;
};

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
  const res = await fetch('/api/generate-first-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, provider: params.provider ?? 'fal' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate first frame');
  return data.images || [];
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
