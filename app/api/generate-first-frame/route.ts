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

const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

const PROMPT =
  'Replace the person in the second image with the person from the first image. ' +
  'Keep the exact same pose, background, camera angle, and lighting from the second image. ' +
  'The person must retain their exact facial features and appearance from the first image. ' +
  'Remove any text, watermarks, or logos. Output a clean photorealistic photograph.';

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

    let modelBuf: Buffer, frameBuf: Buffer;
    try {
      [modelBuf, frameBuf] = await Promise.all([
        downloadImage('MODEL (face)', modelImageUrl),
        downloadImage('SCENE (frame)', frameImageUrl),
      ]);
    } catch (dlErr) {
      const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
      console.error('[FirstFrame] Image download failed:', msg);
      return NextResponse.json(
        { error: `Failed to download input images: ${msg}`, failed: true },
        { status: 400 },
      );
    }

    console.log(`[FirstFrame] Downloaded — model: ${modelBuf.length} bytes, frame: ${frameBuf.length} bytes`);

    // Validate downloaded images are not empty
    if (modelBuf.length < 100) {
      return NextResponse.json(
        { error: 'Model image appears to be empty or corrupted (too small). Please re-upload the face image.', failed: true },
        { status: 400 },
      );
    }
    if (frameBuf.length < 100) {
      return NextResponse.json(
        { error: 'Scene frame image appears to be empty or corrupted (too small). Please re-select or re-upload the scene frame.', failed: true },
        { status: 400 },
      );
    }

    if (!config.FAL_KEY) {
      return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
    }
    fal.config({ credentials: config.FAL_KEY });

    // Convert to JPEG and ensure minimum size for model compatibility
    const [modelJpeg, frameJpeg] = await Promise.all([
      sharp(modelBuf)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: false })
        .jpeg({ quality: 95 })
        .toBuffer(),
      sharp(frameBuf)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: false })
        .jpeg({ quality: 95 })
        .toBuffer(),
    ]);
    console.log(`[FirstFrame] Converted to JPEG — model: ${modelJpeg.length} bytes, frame: ${frameJpeg.length} bytes`);

    const [falModelUrl, falFrameUrl] = await Promise.all([
      fal.storage.upload(new Blob([new Uint8Array(modelJpeg)], { type: 'image/jpeg' })),
      fal.storage.upload(new Blob([new Uint8Array(frameJpeg)], { type: 'image/jpeg' })),
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
      if (!url) throw new Error('No image URL returned from FAL');
      resultBuf = Buffer.from(await fetchWithRetry(url));
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : String(err);
      // Extract detailed error from FAL response body if available
      if (err && typeof err === 'object' && 'body' in err) {
        const body = (err as { body: unknown }).body;
        // FAL errors can be a JSON array like [{"msg": "...", "type": "..."}]
        if (Array.isArray(body) && body.length > 0) {
          const first = body[0];
          errorMsg = first?.msg || first?.message || first?.detail || JSON.stringify(first);
        } else if (body && typeof body === 'object') {
          const b = body as Record<string, unknown>;
          const detail = b.detail || b.message || b.error;
          if (detail) errorMsg = typeof detail === 'string' ? detail : JSON.stringify(detail);
        }
      }
      // Also handle case where err.message itself is a JSON string
      try {
        const parsed = JSON.parse(errorMsg);
        if (Array.isArray(parsed) && parsed.length > 0) {
          errorMsg = parsed[0]?.msg || parsed[0]?.message || errorMsg;
        }
      } catch { /* not JSON, use as-is */ }
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
