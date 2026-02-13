import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { config } from '@/lib/config';
import { uploadImage, getSignedUrlFromPublicUrl, downloadToBuffer } from '@/lib/storage.js';
import { initDatabase, createGeneratedImage } from '@/lib/db';

export const maxDuration = 120;

// Prompt A: Strict face-swap — describe images by content, not position numbers.
const PROMPT_A =
  'FACE SWAP task. There are two reference images: one is a close-up portrait/headshot of a person, ' +
  'and the other is a full scene showing a body pose and background environment. ' +
  'Take the EXACT person from the portrait/headshot — their precise face, gender, age, ethnicity, skin tone, hair color, hair style, and every facial feature — ' +
  'and place them into the scene/environment from the other image. ' +
  'The person in the output MUST be identical and recognizable as the person from the portrait. ' +
  'Keep the pose, camera angle, lighting, and background from the scene image. ' +
  'Do NOT invent a new face. Do NOT blend or average the faces. The portrait face is the ONLY identity to use. ' +
  'Photorealistic output, consistent lighting, natural skin texture.';

// Prompt B: Same intent, alternative wording for diversity.
const PROMPT_B =
  'Replace the person in the scene/background image with the person from the portrait/headshot image. ' +
  'The portrait provides the ONLY face identity to use: copy every facial feature, gender, age, ethnicity, skin color, and hairstyle exactly. ' +
  'The scene/background image provides ONLY the environment, body position, camera angle, and clothing style. ' +
  'CRITICAL: The output must look like a real photograph of the portrait person standing in the scene location. ' +
  'Do NOT create a different person. Do NOT change the gender or facial features from the portrait. ' +
  'Do NOT use any facial features from the scene image. Preserve photorealistic quality with natural lighting and skin detail.';


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
    const { modelImageUrl, frameImageUrl, firstFrameModel = 'nano-banana' } = await req.json();

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

    console.log('[FirstFrame] FAL URLs — model (face):', falModelUrl.slice(0, 60), '| scene:', falFrameUrl.slice(0, 60));

    // ── Branch: call the selected model ──
    let falImageUrlA: string;
    let falImageUrlB: string;

    if (firstFrameModel === 'kling-v3') {
      // Kling V3: single call with num_images: 2
      const KLING_PROMPT =
        'Replace the person in this image with the face from the reference portrait. ' +
        'Keep the exact same pose, camera angle, clothing, lighting, and background. ' +
        'The output person must be identical to the portrait: same face, gender, age, ethnicity, skin tone, hair. ' +
        'Photorealistic, natural lighting, high quality.';

      console.log('[FirstFrame] Calling kling-image/v3/image-to-image (2 variants)...');

      const klingResult = await fal.subscribe('fal-ai/kling-image/v3/image-to-image', {
        input: {
          image_url: falFrameUrl,
          elements: [{ frontal_image_url: falModelUrl }],
          prompt: KLING_PROMPT,
          num_images: 2,
        },
        logs: true,
      });

      console.log('[FirstFrame] kling-v3 done, extracting results...');

      const images = klingResult.data?.images;
      falImageUrlA = images?.[0]?.url;
      falImageUrlB = images?.[1]?.url;

      if (!falImageUrlA || !falImageUrlB) {
        console.error('[FirstFrame] Missing Kling result URLs:', JSON.stringify(klingResult.data).slice(0, 300));
        throw new Error('No image URLs returned from Kling V3');
      }
    } else {
      // Nano Banana Pro: two separate calls with different prompts
      const imageUrls = [falModelUrl, falFrameUrl];

      console.log('[FirstFrame] Calling nano-banana-pro/edit (2 variants)...');

      const [resultA, resultB] = await Promise.all([
        fal.subscribe('fal-ai/nano-banana-pro/edit', {
          input: {
            image_urls: imageUrls,
            prompt: PROMPT_A,
            limit_generations: true,
          },
          logs: true,
        }),
        fal.subscribe('fal-ai/nano-banana-pro/edit', {
          input: {
            image_urls: imageUrls,
            prompt: PROMPT_B,
            limit_generations: true,
          },
          logs: true,
        }),
      ]);

      console.log('[FirstFrame] nano-banana-pro done, extracting results...');

      falImageUrlA = resultA.data?.images?.[0]?.url;
      falImageUrlB = resultB.data?.images?.[0]?.url;

      if (!falImageUrlA || !falImageUrlB) {
        console.error('[FirstFrame] Missing result URLs:', {
          A: JSON.stringify(resultA.data).slice(0, 200),
          B: JSON.stringify(resultB.data).slice(0, 200),
        });
        throw new Error('No image URL returned from Nano Banana Pro');
      }
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
