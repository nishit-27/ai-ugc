import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { config } from '@/lib/config';
import { uploadImage, downloadToBuffer } from '@/lib/storage.js';
import { isR2Url } from '@/lib/r2';
import { initDatabase, createGeneratedImage } from '@/lib/db';
import { auth } from '@/lib/auth';
import { generateImageWithReferences } from '@/lib/gemini-image';

export const maxDuration = 300;

const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

const FACE_SWAP_PROMPT =
  'Replace the person in the second image with the person from the first image. ' +
  'Keep the exact same pose, background, camera angle, and lighting from the second image. ' +
  'The person must retain their exact facial features and appearance from the first image. ' +
  'Output a 1:1 square aspect ratio. ' +
  'Remove any text, watermarks, or logos. Output a clean photorealistic photograph.';

const FACE_SWAP_PROMPT_PRESERVE_TEXT =
  'Replace the person in the second image with the person from the first image. ' +
  'Keep the exact same pose, background, camera angle, and lighting from the second image. ' +
  'The person must retain their exact facial features and appearance from the first image. ' +
  'Output a 1:1 square aspect ratio. ' +
  'Preserve and accurately reproduce any text, captions, or typography that appears in the scene image. The text should remain legible and in the same position. ' +
  'Output a clean photorealistic photograph.';

async function fetchWithRetry(url: string, retries = 3): Promise<ArrayBuffer> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.arrayBuffer();
    } catch (err) {
      console.warn(`[CarouselGen] fetch attempt ${i + 1}/${retries} failed:`, (err as Error).message);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('fetch failed after retries');
}

/** Pad image to 1:1 square with white background */
async function padToSquare(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  if (w === h) return buf;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padRight = size - w - padLeft;
  const padTop = Math.floor((size - h) / 2);
  const padBottom = size - h - padTop;
  return sharp(buf)
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
}

function stripSignedParams(url: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.has('X-Goog-Signature') || u.searchParams.has('X-Goog-Date')) {
      return `${u.origin}${u.pathname}`;
    }
  } catch { /* not a valid URL, return as-is */ }
  return url;
}

const isGcsUrl = (url: string) =>
  url.includes('storage.googleapis.com') || url.includes('storage.cloud.google.com');

const isDirectlyFetchable = (url: string) => isR2Url(url) || !isGcsUrl(url);

async function downloadImage(url: string): Promise<Buffer> {
  const baseUrl = stripSignedParams(url);
  if (isDirectlyFetchable(baseUrl)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (isGcsUrl(baseUrl)) {
    return Buffer.from(await downloadToBuffer(baseUrl));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function generateFaceSwap(
  prompt: string,
  resolution: string,
  falImageUrls: string[],
): Promise<Buffer | null> {
  try {
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        image_urls: falImageUrls,
        prompt,
        num_images: 1,
        output_format: 'jpeg',
        limit_generations: true,
        resolution: resolution || '1K',
        safety_tolerance: 6,
        thinking_level: 'high',
      } as Parameters<typeof fal.subscribe<typeof FAL_MODEL>>[1]['input'],
      logs: true,
    });
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('No image URL returned');
    return Buffer.from(await fetchWithRetry(url));
  } catch (err) {
    console.error(`[CarouselGen] Face swap failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Generate face-swap images for carousel.
 * Takes a model portrait + scene image(s) and generates composites.
 *
 * Body: {
 *   modelImageUrl: string;     // model portrait
 *   sceneImageUrl: string;     // single scene/background image
 *   count?: number;            // how many variants per scene (1 or 2, default 1)
 *   provider?: string;         // gemini | fal | gpt-image
 *   resolution?: string;       // 1K | 2K | 4K
 *   modelId?: string;          // for DB tracking
 * }
 */
export async function POST(req: Request) {
  try {
    const {
      modelImageUrl,
      sceneImageUrl,
      count = 1,
      resolution = '1K',
      modelId,
      preserveText = false,
      provider = 'fal',
    } = await req.json();

    if (!modelImageUrl || !sceneImageUrl) {
      return NextResponse.json(
        { error: 'modelImageUrl and sceneImageUrl are required' },
        { status: 400 },
      );
    }

    const numVariants = Math.min(Math.max(1, count), 2);
    console.log(`[CarouselGen] Model: ${FAL_MODEL}, variants: ${numVariants}`);

    // Download both images
    const [modelBuf, rawSceneBuf] = await Promise.all([
      downloadImage(modelImageUrl),
      downloadImage(sceneImageUrl),
    ]);
    // Pad scene image to 1:1 square so AI generates square output
    const sceneBuf = await padToSquare(rawSceneBuf);
    console.log(`[CarouselGen] Downloaded — model: ${modelBuf.length}B, scene: ${sceneBuf.length}B (padded to 1:1)`);

    // Convert to JPEG and ensure minimum size
    const [modelJpeg, sceneJpeg] = await Promise.all([
      sharp(modelBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: false }).jpeg({ quality: 95 }).toBuffer(),
      sharp(sceneBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: false }).jpeg({ quality: 95 }).toBuffer(),
    ]);

    const activeProvider = provider === 'gemini' ? 'gemini' : 'fal';
    const prompt = preserveText ? FACE_SWAP_PROMPT_PRESERVE_TEXT : FACE_SWAP_PROMPT;
    console.log(`[CarouselGen] Using provider: ${activeProvider}`);

    let successfulBuffers: Buffer[];

    if (activeProvider === 'gemini') {
      // --- Gemini path ---
      const promises = Array.from({ length: numVariants }, async () => {
        try {
          return await generateImageWithReferences({
            prompt,
            referenceImages: [
              { data: modelJpeg, mimeType: 'image/jpeg' },
              { data: sceneJpeg, mimeType: 'image/jpeg' },
            ],
          });
        } catch (err) {
          console.error('[CarouselGen] Gemini generation failed:', (err as Error).message);
          return null;
        }
      });
      const results = await Promise.all(promises);
      successfulBuffers = results.filter((b): b is Buffer => b !== null);
    } else {
      // --- FAL path ---
      if (!config.FAL_KEY) {
        return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
      }
      fal.config({ credentials: config.FAL_KEY });

      const [falModelUrl, falSceneUrl] = await Promise.all([
        fal.storage.upload(new Blob([new Uint8Array(modelJpeg)], { type: 'image/jpeg' })),
        fal.storage.upload(new Blob([new Uint8Array(sceneJpeg)], { type: 'image/jpeg' })),
      ]);
      const falImageUrls = [falModelUrl, falSceneUrl];

      const promises = Array.from({ length: numVariants }, () =>
        generateFaceSwap(prompt, resolution, falImageUrls),
      );
      const results = await Promise.all(promises);
      successfulBuffers = results.filter((b): b is Buffer => b !== null);
    }

    if (successfulBuffers.length === 0) {
      return NextResponse.json({ error: 'Face swap generation failed' }, { status: 500 });
    }

    // Compress, upload, persist to DB
    await initDatabase();
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    const images: { id?: string; url: string; gcsUrl: string }[] = [];
    for (const buf of successfulBuffers) {
      const compressed = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
      const uploaded = await uploadImage(
        compressed,
        `carousel-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`,
      );

      let imgId: string | undefined;
      try {
        const row = await createGeneratedImage({
          gcsUrl: uploaded.url,
          filename: uploaded.url.split('/').pop() || 'carousel-gen.jpg',
          modelImageUrl,
          sceneImageUrl,
          promptVariant: 'carousel',
          modelId: modelId || null,
          createdBy,
        });
        imgId = row?.id;
      } catch (dbErr) {
        console.error('[CarouselGen] Failed to persist to DB:', dbErr);
      }

      images.push({ id: imgId, url: uploaded.url, gcsUrl: uploaded.url });
    }

    console.log(`[CarouselGen] Generated ${images.length}/${numVariants} variants`);
    return NextResponse.json({ images });
  } catch (error: unknown) {
    console.error('[CarouselGen] Error:', error);
    if (error && typeof error === 'object' && 'body' in error) {
      console.error('[CarouselGen] Error body:', JSON.stringify((error as { body: unknown }).body, null, 2));
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
