import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { config } from '@/lib/config';
import { uploadImage, downloadToBuffer } from '@/lib/storage.js';
import { isR2Url } from '@/lib/r2';
import { initDatabase, createGeneratedImage } from '@/lib/db';
import { auth } from '@/lib/auth';

export const maxDuration = 300;

const FACE_SWAP_PROMPT =
  'I have two reference photos. The first is a portrait of a specific person. The second is a scene with a background and body pose. ' +
  'Generate a new photorealistic image in a 1:1 square aspect ratio showing the person from the portrait photo placed naturally into the scene from the second photo. ' +
  'The person in the output must look exactly like the portrait — same appearance, hair, and features. ' +
  'Use the pose, camera angle, lighting, and environment from the scene photo. ' +
  'Remove any text, captions, watermarks, or logos that appear in the scene image. ' +
  'The result should look like a natural photograph with consistent lighting and realistic skin texture.';

const FACE_SWAP_PROMPT_PRESERVE_TEXT =
  'I have two reference photos. The first is a portrait of a specific person. The second is a scene with a background and body pose. ' +
  'Generate a new photorealistic image in a 1:1 square aspect ratio showing the person from the portrait photo placed naturally into the scene from the second photo. ' +
  'The person in the output must look exactly like the portrait — same appearance, hair, and features. ' +
  'Use the pose, camera angle, lighting, and environment from the scene photo. ' +
  'Preserve and accurately reproduce any text, captions, or typography that appears in the scene image. The text should remain legible and in the same position. ' +
  'The result should look like a natural photograph with consistent lighting and realistic skin texture.';

function detectImageType(buf: Buffer): { contentType: string; ext: string } {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { contentType: 'image/png', ext: 'png' };
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  return { contentType: 'image/jpeg', ext: 'jpg' };
}

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

async function prepareImageForGemini(buf: Buffer): Promise<{ b64: string; mime: string }> {
  const resized = await sharp(buf)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { b64: resized.toString('base64'), mime: 'image/jpeg' };
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
  provider: string,
  prompt: string,
  modelBuf: Buffer,
  sceneBuf: Buffer,
  resolution: string,
  falImageUrls?: string[],
): Promise<Buffer | null> {
  try {
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });
      const [modelImg, sceneImg] = await Promise.all([
        prepareImageForGemini(modelBuf),
        prepareImageForGemini(sceneBuf),
      ]);
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [
          { text: prompt },
          { inlineData: { mimeType: modelImg.mime, data: modelImg.b64 } },
          { inlineData: { mimeType: sceneImg.mime, data: sceneImg.b64 } },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          personGeneration: 'ALLOW_ALL',
        } as Parameters<typeof ai.models.generateContent>[0]['config'],
      });
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
        }
      }
      throw new Error('Gemini returned no image');
    } else if (provider === 'gpt-image') {
      const result = await fal.subscribe('fal-ai/gpt-image-1.5/edit', {
        input: {
          image_urls: falImageUrls!,
          prompt,
          image_size: '1024x1024' as const,
          quality: 'high' as const,
          input_fidelity: 'high' as const,
          num_images: 1,
          output_format: 'png' as const,
        },
        logs: true,
      });
      const url = result.data?.images?.[0]?.url;
      if (!url) throw new Error('No image URL returned');
      return Buffer.from(await fetchWithRetry(url));
    } else {
      const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
        input: {
          image_urls: falImageUrls!,
          prompt,
          limit_generations: true,
          resolution: resolution || '1K',
          safety_tolerance: 6,
        } as Parameters<typeof fal.subscribe<'fal-ai/nano-banana-pro/edit'>>[1]['input'],
        logs: true,
      });
      const url = result.data?.images?.[0]?.url;
      if (!url) throw new Error('No image URL returned');
      return Buffer.from(await fetchWithRetry(url));
    }
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
      provider = 'gpt-image',
      resolution = '1K',
      modelId,
      preserveText = false,
    } = await req.json();

    if (!modelImageUrl || !sceneImageUrl) {
      return NextResponse.json(
        { error: 'modelImageUrl and sceneImageUrl are required' },
        { status: 400 },
      );
    }

    const numVariants = Math.min(Math.max(1, count), 2);
    console.log(`[CarouselGen] Provider: ${provider}, variants: ${numVariants}`);

    // Download both images
    const [modelBuf, rawSceneBuf] = await Promise.all([
      downloadImage(modelImageUrl),
      downloadImage(sceneImageUrl),
    ]);
    // Pad scene image to 1:1 square so AI generates square output
    const sceneBuf = await padToSquare(rawSceneBuf);
    console.log(`[CarouselGen] Downloaded — model: ${modelBuf.length}B, scene: ${sceneBuf.length}B (padded to 1:1)`);

    // Upload to FAL CDN if using FAL-based provider
    let falImageUrls: string[] | undefined;
    if (provider === 'fal' || provider === 'gpt-image') {
      if (!config.FAL_KEY) {
        return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
      }
      fal.config({ credentials: config.FAL_KEY });
      const modelType = detectImageType(modelBuf).contentType;
      const sceneType = detectImageType(sceneBuf).contentType;
      const [falModelUrl, falSceneUrl] = await Promise.all([
        fal.storage.upload(new Blob([new Uint8Array(modelBuf)], { type: modelType })),
        fal.storage.upload(new Blob([new Uint8Array(sceneBuf)], { type: sceneType })),
      ]);
      falImageUrls = [falModelUrl, falSceneUrl];
    } else if (provider === 'gemini' && !config.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Generate variants
    const prompt = preserveText ? FACE_SWAP_PROMPT_PRESERVE_TEXT : FACE_SWAP_PROMPT;
    const promises = Array.from({ length: numVariants }, () =>
      generateFaceSwap(provider, prompt, modelBuf, sceneBuf, resolution, falImageUrls),
    );
    const results = await Promise.all(promises);
    const successfulBuffers = results.filter((b): b is Buffer => b !== null);

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
