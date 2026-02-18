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
  provider?: 'gemini' | 'fal';
}): Promise<FirstFrameOption[]> {
  const res = await fetch('/api/generate-first-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, provider: params.provider ?? 'gemini' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate first frame');
  return data.images || [];
}

export async function fetchGeneratedImages(params: { modelId?: string; limit?: number }): Promise<unknown[]> {
  const query = params.modelId
    ? `/api/generated-images?modelId=${params.modelId}&signed=true`
    : `/api/generated-images?limit=${params.limit || 50}&signed=true`;
  const res = await fetch(query);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load images');
  return data.images || [];
}
