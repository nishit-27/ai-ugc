import type { GeneratedImage } from '@/types';

export async function ensureSignedGeneratedImages(images: GeneratedImage[]): Promise<GeneratedImage[]> {
  return images.map((img) => ({
    ...img,
    signedUrl: img.signedUrl || img.gcsUrl || undefined,
  }));
}
