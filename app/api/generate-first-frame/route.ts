import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { config } from '@/lib/config';
import { uploadImage, getSignedUrlFromPublicUrl, downloadToBuffer } from '@/lib/storage.js';
import { initDatabase, createGeneratedImage } from '@/lib/db';

export const maxDuration = 120;

// Prompt A: Strict face-swap — model image (1) is the identity, scene frame (2) is background/pose only.
const PROMPT_A =
  'FACE SWAP — Image 1 is the ONLY identity to use. Image 2 is ONLY a scene/pose reference. ' +
  'Take the EXACT person from image 1 — their precise face, gender, age, ethnicity, skin tone, hair color, hair style, and every facial feature — and place them into the scene from image 2. ' +
  'You MUST preserve the gender and full facial identity from image 1. Do NOT invent a new face. Do NOT use any face from image 2. ' +
  'The output must show the same recognizable person from image 1, in the pose and environment of image 2. Photorealistic, consistent lighting.';

// Prompt B: Same intent, alternative wording for diversity.
const PROMPT_B =
  'This is a face replacement task. Image 1 = source person (the face/identity to keep). Image 2 = target scene (the background, body pose, and camera angle to use). ' +
  'Generate a photorealistic photo of the EXACT same person from image 1 standing in the setting of image 2. ' +
  'CRITICAL: The person\'s face, gender, age, skin color, hair, and identity MUST match image 1 exactly. Do NOT generate a different person. Do NOT change their gender or features. ' +
  'Only change the environment, clothing, and body position to match image 2. The result should look like a real photograph of the image 1 person in the image 2 location.';

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
    const { modelImageUrl, frameImageUrl } = await req.json();

    if (!modelImageUrl || !frameImageUrl) {
      return NextResponse.json(
        { error: 'Both modelImageUrl and frameImageUrl are required' },
        { status: 400 },
      );
    }

    if (!config.FAL_KEY) {
      return NextResponse.json(
        { error: 'FAL API key not configured' },
        { status: 500 },
      );
    }

    fal.config({ credentials: config.FAL_KEY });

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

    const downloadImage = async (label: string, url: string): Promise<Buffer> => {
      const baseUrl = stripSignedParams(url);
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

    // Upload directly to FAL's CDN
    const [falModelUrl, falFrameUrl] = await Promise.all([
      fal.storage.upload(new Blob([new Uint8Array(modelBuf)], { type: modelType.contentType })),
      fal.storage.upload(new Blob([new Uint8Array(frameBuf)], { type: frameType.contentType })),
    ]);

    // image_urls: [model/face first, scene/frame second]
    const imageUrls = [falModelUrl, falFrameUrl];

    console.log('[FirstFrame] FAL URLs — model (face):', falModelUrl.slice(0, 60), '| scene:', falFrameUrl.slice(0, 60));

    console.log('[FirstFrame] Calling nano-banana-pro/edit (2 variants)...');

    const [resultA, resultB] = await Promise.all([
      fal.subscribe('fal-ai/nano-banana-pro/edit', {
        input: {
          image_urls: imageUrls,
          prompt: PROMPT_A,
        },
        logs: true,
      }),
      fal.subscribe('fal-ai/nano-banana-pro/edit', {
        input: {
          image_urls: imageUrls,
          prompt: PROMPT_B,
        },
        logs: true,
      }),
    ]);

    console.log('[FirstFrame] nano-banana-pro done, downloading results...');

    // Extract image URLs from results
    const falImageUrlA = resultA.data?.images?.[0]?.url;
    const falImageUrlB = resultB.data?.images?.[0]?.url;

    if (!falImageUrlA || !falImageUrlB) {
      console.error('[FirstFrame] Missing result URLs:', {
        A: JSON.stringify(resultA.data).slice(0, 200),
        B: JSON.stringify(resultB.data).slice(0, 200),
      });
      throw new Error('No image URL returned from Nano Banana Pro');
    }

    console.log('[FirstFrame] Result URLs:', { A: falImageUrlA.slice(0, 60), B: falImageUrlB.slice(0, 60) });

    // Download generated images with retry (FAL connections can be flaky)
    const [bufferA, bufferB] = await Promise.all([
      fetchWithRetry(falImageUrlA),
      fetchWithRetry(falImageUrlB),
    ]);

    const [uploadedA, uploadedB] = await Promise.all([
      uploadImage(Buffer.from(bufferA), `first-frame-a-${Date.now()}.jpg`),
      uploadImage(Buffer.from(bufferB), `first-frame-b-${Date.now()}.jpg`),
    ]);

    const [signedA, signedB] = await Promise.all([
      getSignedUrlFromPublicUrl(uploadedA.url),
      getSignedUrlFromPublicUrl(uploadedB.url),
    ]);

    // Persist generated images to database
    try {
      await initDatabase();
      await Promise.all([
        createGeneratedImage({
          gcsUrl: uploadedA.url,
          filename: uploadedA.url.split('/').pop() || `first-frame-a-${Date.now()}.jpg`,
          modelImageUrl: modelImageUrl,
          sceneImageUrl: frameImageUrl,
          promptVariant: 'A',
        }),
        createGeneratedImage({
          gcsUrl: uploadedB.url,
          filename: uploadedB.url.split('/').pop() || `first-frame-b-${Date.now()}.jpg`,
          modelImageUrl: modelImageUrl,
          sceneImageUrl: frameImageUrl,
          promptVariant: 'B',
        }),
      ]);
    } catch (dbErr) {
      console.error('Failed to persist generated images to DB:', dbErr);
      // Don't fail the request — images are still returned to the client
    }

    return NextResponse.json({
      images: [
        { url: signedA, gcsUrl: uploadedA.url },
        { url: signedB, gcsUrl: uploadedB.url },
      ],
    });
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
