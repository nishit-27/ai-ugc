import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { config } from '@/lib/config';
import { uploadImage } from '@/lib/storage.js';
import { isR2Url } from '@/lib/r2';
import { initDatabase, createGeneratedImage } from '@/lib/db';
import { createGenerationRequest, updateGenerationRequest } from '@/lib/db-generation-requests';
import { getEndpointCost } from '@/lib/fal-pricing';
import { auth } from '@/lib/auth';

export const maxDuration = 300;

const FAL_MODEL = 'fal-ai/nano-banana-2/edit';

const PROMPT =
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

export async function POST(req: Request) {
  try {
    const { modelImageUrl, frameImageUrl, resolution, modelId } = await req.json();

    if (!modelImageUrl || !frameImageUrl) {
      return NextResponse.json(
        { error: 'Both modelImageUrl and frameImageUrl are required' },
        { status: 400 },
      );
    }

    console.log('[FirstFrame] Input URLs:', {
      modelImageUrl: modelImageUrl.slice(0, 80),
      frameImageUrl: frameImageUrl.slice(0, 80),
    });

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
      if (isDirectlyFetchable(baseUrl)) {
        console.log(`[FirstFrame] Downloading ${label} via fetch: ${url.slice(0, 80)}`);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Failed to fetch ${label}: ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      }
      if (isGcsUrl(baseUrl)) {
        const { downloadToBuffer } = await import('@/lib/storage.js');
        console.log(`[FirstFrame] Downloading ${label} via GCS SDK: ${baseUrl.slice(0, 80)}`);
        return Buffer.from(await downloadToBuffer(baseUrl));
      }
      console.log(`[FirstFrame] Downloading ${label} via fetch: ${url.slice(0, 80)}`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed to fetch ${label}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    };

    const [modelBuf, frameBuf] = await Promise.all([
      downloadImage('MODEL (face)', modelImageUrl),
      downloadImage('SCENE (frame)', frameImageUrl),
    ]);

    console.log(`[FirstFrame] Downloaded — model: ${modelBuf.length} bytes, frame: ${frameBuf.length} bytes`);

    const modelType = detectImageType(modelBuf);
    const frameType = detectImageType(frameBuf);

    if (!config.FAL_KEY) {
      return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
    }
    fal.config({ credentials: config.FAL_KEY });

    const [falModelUrl, falFrameUrl] = await Promise.all([
      fal.storage.upload(new Blob([new Uint8Array(modelBuf)], { type: modelType.contentType })),
      fal.storage.upload(new Blob([new Uint8Array(frameBuf)], { type: frameType.contentType })),
    ]);
    const falImageUrls = [falModelUrl, falFrameUrl];

    await initDatabase();
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;
    const createdByEmail = session?.user?.email || null;

    // Track request
    const genReq = await createGenerationRequest({
      type: 'image',
      provider: 'fal',
      model: FAL_MODEL,
      status: 'processing',
      metadata: { modelImageUrl, frameImageUrl, resolution, modelId },
      createdBy,
      createdByEmail,
    });

    console.log(`[FirstFrame] Generating 1 image with ${FAL_MODEL}...`);

    let resultBuf: Buffer;
    try {
      const result = await fal.subscribe(FAL_MODEL, {
        input: {
          image_urls: falImageUrls,
          prompt: PROMPT,
          limit_generations: true,
          resolution: resolution || '1K',
          safety_tolerance: 6,
        } as Parameters<typeof fal.subscribe<typeof FAL_MODEL>>[1]['input'],
        logs: true,
      });
      const url = result.data?.images?.[0]?.url;
      if (!url) throw new Error('No image URL returned from FAL');
      resultBuf = Buffer.from(await fetchWithRetry(url));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[FirstFrame] Generation failed:', errorMsg);
      await updateGenerationRequest(genReq.id, { status: 'failed', error: errorMsg });
      return NextResponse.json({ error: errorMsg, failed: true }, { status: 500 });
    }

    // Success — compress, upload, persist
    const imageCost = await getEndpointCost(FAL_MODEL, 1);
    await updateGenerationRequest(genReq.id, { status: 'success', cost: imageCost });

    const compressed = await sharp(resultBuf).jpeg({ quality: 85 }).toBuffer();
    const uploaded = await uploadImage(compressed, `first-frame-${Date.now()}.jpg`);

    try {
      await createGeneratedImage({
        gcsUrl: uploaded.url,
        filename: uploaded.url.split('/').pop() || `first-frame-${Date.now()}.jpg`,
        modelImageUrl,
        sceneImageUrl: frameImageUrl,
        promptVariant: 'B',
        modelId: modelId || null,
        createdBy,
      });
    } catch (dbErr) {
      console.error('Failed to persist generated image to DB:', dbErr);
    }

    return NextResponse.json({
      images: [{ url: uploaded.url, gcsUrl: uploaded.url }],
    });
  } catch (error: unknown) {
    console.error('Generate first frame error:', error);
    if (error && typeof error === 'object' && 'body' in error) {
      console.error('FAL error body:', JSON.stringify((error as { body: unknown }).body, null, 2));
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
