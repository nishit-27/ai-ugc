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

// Prompt A: Place the portrait person into the scene — creative direction style.
const PROMPT_A =
  'I have two reference photos. The first is a portrait of a specific person. The second is a scene with a background and body pose. ' +
  'Generate a new photorealistic image showing the person from the portrait photo placed naturally into the scene from the second photo. ' +
  'The person in the output must look exactly like the portrait — same appearance, hair, and features. ' +
  'Use the pose, camera angle, lighting, and environment from the scene photo. ' +
  'The result should look like a natural photograph with consistent lighting and realistic skin texture.';

// Prompt B: Same intent, also removes text/watermarks.
const PROMPT_B =
  'Using the two reference images provided: generate a photorealistic composite image. ' +
  'The first image is a portrait showing a person\'s appearance. The second image shows a scene with a specific pose and background. ' +
  'Create a new image of the portrait person in the scene environment, matching the pose and camera angle from the scene photo. ' +
  'The person must retain their exact appearance from the portrait. ' +
  'Remove any text, captions, watermarks, or logos that appear in the scene image — the output should be a clean photograph. ' +
  'Ensure natural lighting, realistic details, and photographic quality.';


// Detect actual image content type from buffer magic bytes
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

// Fetch with retry for flaky connections
async function fetchWithRetry(url: string, retries = 3): Promise<ArrayBuffer> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.arrayBuffer();
    } catch (err) {
      console.warn(`[FirstFrame] fetch attempt ${i + 1}/${retries} failed:`, (err as Error).message);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('fetch failed after retries');
}

// Resize & normalize image to JPEG ≤1024px for Gemini input
async function prepareImageForGemini(buf: Buffer): Promise<{ b64: string; mime: string }> {
  const resized = await sharp(buf)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { b64: resized.toString('base64'), mime: 'image/jpeg' };
}

// --- Gemini generation path ---
async function generateWithGemini(
  modelBuf: Buffer,
  frameBuf: Buffer,
  prompt: string,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });

  const [modelImg, frameImg] = await Promise.all([
    prepareImageForGemini(modelBuf),
    prepareImageForGemini(frameBuf),
  ]);

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [
      { text: prompt },
      { inlineData: { mimeType: modelImg.mime, data: modelImg.b64 } },
      { inlineData: { mimeType: frameImg.mime, data: frameImg.b64 } },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      personGeneration: 'ALLOW_ALL',
    } as Parameters<typeof ai.models.generateContent>[0]['config'],
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const parts = candidate?.content?.parts;

  console.log(`[FirstFrame] Gemini response — finishReason: ${finishReason}, parts: ${parts?.length ?? 0}`);

  if (parts && parts.length > 0) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }

  throw new Error(`Gemini returned no image (finishReason: ${finishReason})`);
}

// Generate a single variant, returning null on failure
async function generateVariant(
  provider: string,
  prompt: string,
  label: string,
  modelBuf: Buffer,
  frameBuf: Buffer,
  resolution: string,
  falImageUrls?: string[],
): Promise<Buffer | null> {
  try {
    if (provider === 'gemini') {
      return await generateWithGemini(modelBuf, frameBuf, prompt);
    } else if (provider === 'gpt-image') {
      const result = await fal.subscribe('fal-ai/gpt-image-1.5/edit', {
        input: {
          image_urls: falImageUrls!,
          prompt,
          image_size: 'auto' as const,
          quality: 'high' as const,
          input_fidelity: 'high' as const,
          num_images: 1,
          output_format: 'png' as const,
        },
        logs: true,
      });
      const url = result.data?.images?.[0]?.url;
      if (!url) throw new Error(`No image URL returned for variant ${label}`);
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
      if (!url) throw new Error(`No image URL returned for variant ${label}`);
      return Buffer.from(await fetchWithRetry(url));
    }
  } catch (err) {
    console.error(`[FirstFrame] Variant ${label} failed:`, (err as Error).message);
    return null;
  }
}

// Process a single successful buffer: compress, upload, persist to DB, return result
async function processResult(
  buf: Buffer,
  variant: string,
  modelImageUrl: string,
  frameImageUrl: string,
  modelId: string | null,
  createdBy: string | null,
): Promise<{ url: string; gcsUrl: string }> {
  const compressed = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
  const uploaded = await uploadImage(compressed, `first-frame-${variant.toLowerCase()}-${Date.now()}.jpg`);

  try {
    await createGeneratedImage({
      gcsUrl: uploaded.url,
      filename: uploaded.url.split('/').pop() || `first-frame-${variant.toLowerCase()}-${Date.now()}.jpg`,
      modelImageUrl,
      sceneImageUrl: frameImageUrl,
      promptVariant: variant,
      modelId: modelId || null,
      createdBy,
    });
  } catch (dbErr) {
    console.error(`Failed to persist generated image ${variant} to DB:`, dbErr);
  }

  // R2 URLs are public — no signing needed
  return { url: uploaded.url, gcsUrl: uploaded.url };
}

export async function POST(req: Request) {
  try {
    const { modelImageUrl, frameImageUrl, resolution, modelId, provider = 'fal' } = await req.json();

    if (!modelImageUrl || !frameImageUrl) {
      return NextResponse.json(
        { error: 'Both modelImageUrl and frameImageUrl are required' },
        { status: 400 },
      );
    }

    console.log(`[FirstFrame] Provider: ${provider}`);
    console.log('[FirstFrame] Input URLs:', {
      modelImageUrl: modelImageUrl.slice(0, 80),
      frameImageUrl: frameImageUrl.slice(0, 80),
    });

    // Strip signed params to get base GCS URL for SDK download
    const stripSignedParams = (url: string) => {
      try {
        const u = new URL(url);
        if (u.searchParams.has('X-Goog-Signature') || u.searchParams.has('X-Goog-Date')) {
          return `${u.origin}${u.pathname}`;
        }
      } catch { /* not a valid URL, return as-is */ }
      return url;
    };

    const isGcsUrl = (url: string) =>
      url.includes('storage.googleapis.com') || url.includes('storage.cloud.google.com');

    const isDirectlyFetchable = (url: string) => isR2Url(url) || (!isGcsUrl(url));

    const downloadImage = async (label: string, url: string): Promise<Buffer> => {
      const baseUrl = stripSignedParams(url);
      // R2 URLs and external URLs can be fetched directly
      if (isDirectlyFetchable(baseUrl)) {
        console.log(`[FirstFrame] Downloading ${label} via fetch: ${url.slice(0, 80)}`);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Failed to fetch ${label}: ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      }
      if (isGcsUrl(baseUrl)) {
        console.log(`[FirstFrame] Downloading ${label} via GCS SDK: ${baseUrl.slice(0, 80)}`);
        return Buffer.from(await downloadToBuffer(baseUrl));
      }
      console.log(`[FirstFrame] Downloading ${label} via fetch: ${url.slice(0, 80)}`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed to fetch ${label}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    };

    // Download: model = face reference, frame = scene/background
    const [modelBuf, frameBuf] = await Promise.all([
      downloadImage('MODEL (face)', modelImageUrl),
      downloadImage('SCENE (frame)', frameImageUrl),
    ]);

    console.log(`[FirstFrame] Downloaded — model: ${modelBuf.length} bytes, frame: ${frameBuf.length} bytes`);

    const modelType = detectImageType(modelBuf);
    const frameType = detectImageType(frameBuf);

    // Upload to FAL CDN if using a FAL provider
    let falImageUrls: string[] | undefined;
    if (provider === 'fal' || provider === 'gpt-image') {
      if (!config.FAL_KEY) {
        return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
      }
      fal.config({ credentials: config.FAL_KEY });
      const [falModelUrl, falFrameUrl] = await Promise.all([
        fal.storage.upload(new Blob([new Uint8Array(modelBuf)], { type: modelType.contentType })),
        fal.storage.upload(new Blob([new Uint8Array(frameBuf)], { type: frameType.contentType })),
      ]);
      falImageUrls = [falModelUrl, falFrameUrl];
      console.log('[FirstFrame] FAL URLs — model (face):', falModelUrl.slice(0, 60), '| scene:', falFrameUrl.slice(0, 60));
    } else if (provider === 'gemini' && !config.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    console.log(`[FirstFrame] Generating 2 variants with ${provider}...`);

    // Generate both variants — use allSettled so one failure doesn't kill the other
    const [settledA, settledB] = await Promise.allSettled([
      generateVariant(provider, PROMPT_A, 'A', modelBuf, frameBuf, resolution, falImageUrls),
      generateVariant(provider, PROMPT_B, 'B', modelBuf, frameBuf, resolution, falImageUrls),
    ]);

    const bufA = settledA.status === 'fulfilled' ? settledA.value : null;
    const bufB = settledB.status === 'fulfilled' ? settledB.value : null;

    if (!bufA && !bufB) {
      throw new Error('Both variants failed to generate');
    }

    console.log(`[FirstFrame] Variants done — A: ${bufA ? 'ok' : 'failed'}, B: ${bufB ? 'ok' : 'failed'}`);

    // Process successful results
    await initDatabase();
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    const images: { url: string; gcsUrl: string }[] = [];

    const processPromises: Promise<void>[] = [];
    if (bufA) {
      processPromises.push(
        processResult(bufA, 'A', modelImageUrl, frameImageUrl, modelId || null, createdBy)
          .then((result) => { images.push(result); }),
      );
    }
    if (bufB) {
      processPromises.push(
        processResult(bufB, 'B', modelImageUrl, frameImageUrl, modelId || null, createdBy)
          .then((result) => { images.push(result); }),
      );
    }

    await Promise.all(processPromises);

    return NextResponse.json({ images });
  } catch (error: unknown) {
    console.error('Generate first frame error:', error);
    // Log full FAL validation error body for debugging
    if (error && typeof error === 'object' && 'body' in error) {
      console.error('FAL error body:', JSON.stringify((error as { body: unknown }).body, null, 2));
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
