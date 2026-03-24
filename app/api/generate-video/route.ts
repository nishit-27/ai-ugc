import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { config } from '@/lib/config';
import { uploadVideo } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type VideoModel = {
  id: string;
  label: string;
  falEndpoint: string;
  requiresImage: boolean;
  supportsImage: boolean;
  aspectRatios: string[];
  durations: string[];
  buildInput: (params: { prompt: string; imageUrl?: string; aspectRatio: string; duration: string }) => Record<string, unknown>;
};

const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'seedance-1.5-pro',
    label: 'Seedance 1.5 Pro',
    falEndpoint: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    requiresImage: true,
    supportsImage: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    durations: ['4', '5', '6', '7', '8', '9', '10', '11', '12'],
    buildInput: ({ prompt, imageUrl, aspectRatio, duration }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      duration,
      resolution: '720p',
      generate_audio: true,
    }),
  },
  {
    id: 'kling-v2.6-pro-i2v',
    label: 'Kling V2.6 Pro',
    falEndpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video',
    requiresImage: true,
    supportsImage: true,
    aspectRatios: ['16:9', '9:16'],
    durations: ['5', '10'],
    buildInput: ({ prompt, imageUrl, duration }) => ({
      prompt,
      start_image_url: imageUrl,
      duration,
      negative_prompt: 'blur, distort, and low quality',
      generate_audio: true,
    }),
  },
  {
    id: 'veo-3.1-i2v',
    label: 'Veo 3.1 (Image)',
    falEndpoint: 'fal-ai/veo3.1/image-to-video',
    requiresImage: true,
    supportsImage: true,
    aspectRatios: ['16:9', '9:16'],
    durations: ['4', '6', '8'],
    buildInput: ({ prompt, imageUrl, aspectRatio, duration }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      duration: duration + 's',
      resolution: '720p',
      generate_audio: true,
      safety_tolerance: '4',
    }),
  },
  {
    id: 'veo-3.1-t2v',
    label: 'Veo 3.1 (Text)',
    falEndpoint: 'fal-ai/veo3.1',
    requiresImage: false,
    supportsImage: false,
    aspectRatios: ['16:9', '9:16'],
    durations: ['4', '6', '8'],
    buildInput: ({ prompt, aspectRatio, duration }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      duration: duration + 's',
      resolution: '720p',
      generate_audio: true,
      auto_fix: true,
      safety_tolerance: '4',
    }),
  },
];

export async function GET() {
  const models = VIDEO_MODELS.map(({ id, label, requiresImage, supportsImage, aspectRatios, durations }) => ({
    id, label, requiresImage, supportsImage, aspectRatios, durations,
  }));
  return NextResponse.json({ models });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, prompt, imageUrl, aspectRatio = '9:16', duration = '5' } = body as {
      modelId: string;
      prompt: string;
      imageUrl?: string;
      aspectRatio?: string;
      duration?: string;
    };

    if (!modelId || !prompt) {
      return NextResponse.json({ error: 'modelId and prompt are required' }, { status: 400 });
    }

    const model = VIDEO_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
    }

    if (model.requiresImage && !imageUrl) {
      return NextResponse.json({ error: `${model.label} requires a reference image` }, { status: 400 });
    }

    if (!model.aspectRatios.includes(aspectRatio)) {
      return NextResponse.json({ error: `${model.label} does not support aspect ratio ${aspectRatio}. Supported: ${model.aspectRatios.join(', ')}` }, { status: 400 });
    }

    if (!model.durations.includes(duration)) {
      return NextResponse.json({ error: `${model.label} does not support ${duration}s duration. Supported: ${model.durations.map(d => d + 's').join(', ')}` }, { status: 400 });
    }

    const falKey = config.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 });
    }

    fal.config({ credentials: falKey });

    const input = model.buildInput({ prompt, imageUrl, aspectRatio, duration });

    console.log(`[GenerateVideo] Submitting to ${model.falEndpoint}`, { modelId, hasImage: !!imageUrl });

    // Use subscribe for blocking wait (up to 5 min)
    const result = await fal.subscribe(model.falEndpoint, {
      input,
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log(`[GenerateVideo] ${modelId} in progress...`);
        }
      },
    });

    const videoUrl = (result.data as { video?: { url?: string } })?.video?.url;
    if (!videoUrl) {
      console.error('[GenerateVideo] No video URL in result:', JSON.stringify(result.data));
      return NextResponse.json({ error: 'No video generated' }, { status: 500 });
    }

    // Download from FAL and upload to R2 for persistence
    let r2Url: string | null = null;
    try {
      const videoRes = await fetch(videoUrl);
      if (videoRes.ok) {
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        const uploaded = await uploadVideo(buffer, `gen-${modelId}-${Date.now()}.mp4`);
        r2Url = uploaded.url;
      }
    } catch (err) {
      console.warn('[GenerateVideo] R2 upload failed, using FAL URL:', (err as Error).message);
    }

    return NextResponse.json({
      success: true,
      videoUrl: r2Url || videoUrl,
      falVideoUrl: videoUrl,
      modelId,
      requestId: result.requestId,
    });
  } catch (err) {
    const raw = err as Record<string, unknown>;
    // FAL errors often have body.detail
    const detail = raw?.body && typeof raw.body === 'object' ? (raw.body as Record<string, unknown>).detail : null;
    const message = (typeof detail === 'string' ? detail : null)
      || (err as Error).message
      || 'Video generation failed';
    console.error('[GenerateVideo] Error:', message, raw?.status || '');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
