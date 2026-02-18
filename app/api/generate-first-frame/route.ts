import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { config } from '@/lib/config';
import { uploadImage, getSignedUrlFromPublicUrl, downloadToBuffer } from '@/lib/storage.js';
import { initDatabase, createGeneratedImage } from '@/lib/db';
import { auth } from '@/lib/auth';

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

// Prompt B: Same face-swap intent but removes any text/watermarks from the scene image.
const PROMPT_B =
  'Replace the person in the scene/background image with the person from the portrait/headshot image. ' +
  'The portrait provides the ONLY face identity to use: copy every facial feature, gender, age, ethnicity, skin color, and hairstyle exactly. ' +
  'The scene/background image provides ONLY the environment, body position, camera angle, and clothing style. ' +
  'CRITICAL: The output must look like a real photograph of the portrait person standing in the scene location. ' +
  'Do NOT create a different person. Do NOT change the gender or facial features from the portrait. ' +
  'Do NOT use any facial features from the scene image. ' +
  'IMPORTANT: If the scene/background image contains any text, captions, watermarks, logos, subtitles, or written words overlaid on it, ' +
  'do NOT reproduce that text in the output. Remove all text overlays and render a clean image without any written text. ' +
  'Preserve photorealistic quality with natural lighting and skin detail.';


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

// --- Gemini generation path ---
async function generateWithGemini(
  modelBuf: Buffer,
  frameBuf: Buffer,
  modelType: { contentType: string; ext: string },
  frameType: { contentType: string; ext: string },
  prompt: string,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });

  const modelB64 = modelBuf.toString('base64');
  const frameB64 = frameBuf.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType: modelType.contentType,
          data: modelB64,
        },
      },
      {
        inlineData: {
          mimeType: frameType.contentType,
          data: frameB64,
        },
      },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Extract the generated image from response
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error('Gemini returned no content parts');
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  throw new Error('Gemini response contained no image data');
}

export async function POST(req: Request) {
  try {
    const { modelImageUrl, frameImageUrl, resolution, modelId, provider = 'gemini' } = await req.json();

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

    let bufferA: Buffer | ArrayBuffer;
    let bufferB: Buffer | ArrayBuffer;

    if (provider === 'gemini') {
      // --- Gemini path ---
      if (!config.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: 'Gemini API key not configured' },
          { status: 500 },
        );
      }

      console.log('[FirstFrame] Calling Gemini gemini-3-pro-image-preview (2 variants)...');

      const [geminiA, geminiB] = await Promise.all([
        generateWithGemini(modelBuf, frameBuf, modelType, frameType, PROMPT_A),
        generateWithGemini(modelBuf, frameBuf, modelType, frameType, PROMPT_B),
      ]);

      console.log('[FirstFrame] Gemini done, uploading results...');
      bufferA = geminiA;
      bufferB = geminiB;
    } else {
      // --- FAL path (original) ---
      if (!config.FAL_KEY) {
        return NextResponse.json(
          { error: 'FAL API key not configured' },
          { status: 500 },
        );
      }

      fal.config({ credentials: config.FAL_KEY });

      // Upload directly to FAL's CDN
      const [falModelUrl, falFrameUrl] = await Promise.all([
        fal.storage.upload(new Blob([new Uint8Array(modelBuf)], { type: modelType.contentType })),
        fal.storage.upload(new Blob([new Uint8Array(frameBuf)], { type: frameType.contentType })),
      ]);

      const imageUrls = [falModelUrl, falFrameUrl];

      console.log('[FirstFrame] FAL URLs — model (face):', falModelUrl.slice(0, 60), '| scene:', falFrameUrl.slice(0, 60));
      console.log('[FirstFrame] Calling nano-banana-pro/edit (2 variants)...');

      const falResolution = resolution || '1K';

      const [resultA, resultB] = await Promise.all([
        fal.subscribe('fal-ai/nano-banana-pro/edit', {
          input: {
            image_urls: imageUrls,
            prompt: PROMPT_A,
            limit_generations: true,
            resolution: falResolution,
          },
          logs: true,
        }),
        fal.subscribe('fal-ai/nano-banana-pro/edit', {
          input: {
            image_urls: imageUrls,
            prompt: PROMPT_B,
            limit_generations: true,
            resolution: falResolution,
          },
          logs: true,
        }),
      ]);

      console.log('[FirstFrame] nano-banana-pro done, downloading results...');

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

      [bufferA, bufferB] = await Promise.all([
        fetchWithRetry(falImageUrlA),
        fetchWithRetry(falImageUrlB),
      ]);
    }

    // Compress to JPEG (reduces 4K image sizes that cause video gen failures downstream)
    const [compressedA, compressedB] = await Promise.all([
      sharp(Buffer.from(new Uint8Array(bufferA))).jpeg({ quality: 85 }).toBuffer(),
      sharp(Buffer.from(new Uint8Array(bufferB))).jpeg({ quality: 85 }).toBuffer(),
    ]);

    console.log(`[FirstFrame] Compressed to JPEG — A: ${compressedA.length} bytes, B: ${compressedB.length} bytes`);

    const [uploadedA, uploadedB] = await Promise.all([
      uploadImage(compressedA, `first-frame-a-${Date.now()}.jpg`),
      uploadImage(compressedB, `first-frame-b-${Date.now()}.jpg`),
    ]);

    const [signedA, signedB] = await Promise.all([
      getSignedUrlFromPublicUrl(uploadedA.url),
      getSignedUrlFromPublicUrl(uploadedB.url),
    ]);

    // Persist generated images to database
    try {
      await initDatabase();
      const session = await auth();
      const createdBy = session?.user?.name?.split(' ')[0] || null;
      await Promise.all([
        createGeneratedImage({
          gcsUrl: uploadedA.url,
          filename: uploadedA.url.split('/').pop() || `first-frame-a-${Date.now()}.jpg`,
          modelImageUrl: modelImageUrl,
          sceneImageUrl: frameImageUrl,
          promptVariant: 'A',
          modelId: modelId || null,
          createdBy,
        }),
        createGeneratedImage({
          gcsUrl: uploadedB.url,
          filename: uploadedB.url.split('/').pop() || `first-frame-b-${Date.now()}.jpg`,
          modelImageUrl: modelImageUrl,
          sceneImageUrl: frameImageUrl,
          promptVariant: 'B',
          modelId: modelId || null,
          createdBy,
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
