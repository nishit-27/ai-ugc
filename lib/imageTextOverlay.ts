import sharp from 'sharp';
import fs from 'fs';
import { renderTextOverlayPng } from './ffmpegTextOverlay';
import { cleanupTempWorkspace, createTempWorkspace } from '@/lib/tempWorkspace';
import type { TextOverlayConfig } from '@/types';

/**
 * Burn text overlay onto a static image using sharp.
 * Reuses the same Pango text renderer from ffmpegTextOverlay
 * but composites onto an image instead of a video.
 */
export async function addTextOverlayToImage(
  inputPath: string,
  outputPath: string,
  config: TextOverlayConfig,
): Promise<void> {
  const meta = await sharp(inputPath).metadata();
  const width = meta.width || 1080;
  const height = meta.height || 1920;
  const tempDir = createTempWorkspace('image-text-overlay');

  const overlayPng = await renderTextOverlayPng(width, height, config, tempDir);
  try {
    await sharp(inputPath)
      .composite([{ input: overlayPng }])
      .toFile(outputPath);
  } finally {
    try { fs.unlinkSync(overlayPng); } catch {}
    cleanupTempWorkspace(tempDir);
  }
}
