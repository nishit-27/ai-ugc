import { NextResponse } from 'next/server';

export const maxDuration = 300;

type ModelEntry = {
  modelImageUrl: string;
  modelId?: string;
};

type BatchRequest = {
  models: ModelEntry[];
  frameImageUrl: string;
  resolution?: string;
  provider?: string;
};

type ImageResult = { url: string; gcsUrl: string };
type ModelResult = {
  modelId?: string;
  images: ImageResult[];
  error?: string;
};

export async function POST(req: Request) {
  try {
    const { models, frameImageUrl, resolution, provider = 'fal' } = (await req.json()) as BatchRequest;

    if (!models || !Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: 'models array is required' }, { status: 400 });
    }
    if (!frameImageUrl) {
      return NextResponse.json({ error: 'frameImageUrl is required' }, { status: 400 });
    }

    // Build the origin URL for internal API calls
    const origin = req.headers.get('origin')
      || `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;

    // Forward cookies/auth from the original request
    const cookie = req.headers.get('cookie') || '';

    // Fire ALL models in parallel — server-side, no browser connection limit
    const results = await Promise.allSettled(
      models.map(async (entry): Promise<ModelResult> => {
        const res = await fetch(`${origin}/api/generate-first-frame`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify({
            modelImageUrl: entry.modelImageUrl,
            frameImageUrl,
            resolution,
            modelId: entry.modelId,
            provider,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          return {
            modelId: entry.modelId,
            images: [],
            error: data.error || `HTTP ${res.status}`,
          };
        }

        return {
          modelId: entry.modelId,
          images: data.images || [],
        };
      }),
    );

    const modelResults: ModelResult[] = results.map((settled, i) => {
      if (settled.status === 'fulfilled') return settled.value;
      return {
        modelId: models[i].modelId,
        images: [],
        error: (settled.reason as Error)?.message || 'Unknown error',
      };
    });

    const succeeded = modelResults.filter((r) => r.images.length > 0).length;
    const failed = modelResults.filter((r) => r.images.length === 0).length;

    console.log(`[FirstFrame Batch] ${succeeded} succeeded, ${failed} failed out of ${models.length}`);

    return NextResponse.json({ results: modelResults });
  } catch (error) {
    console.error('Generate first frame batch error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
