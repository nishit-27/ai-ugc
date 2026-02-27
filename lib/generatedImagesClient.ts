import type { GeneratedImage } from '@/types';

/** Ensures all images have a displayable URL. R2 URLs are public — no signing needed. */
export async function ensureSignedGeneratedImages(images: GeneratedImage[]): Promise<GeneratedImage[]> {
  return images.map((img) => ({
    ...img,
    signedUrl: img.signedUrl || img.gcsUrl || undefined,
  }));
}
