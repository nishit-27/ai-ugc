import { NextResponse } from 'next/server';

export const maxDuration = 300;

/** Max concurrent requests to avoid Gemini/FAL rate limits */
const CONCURRENCY_LIMIT = 2;
/** Delay between chunks in ms */
const CHUNK_DELAY_MS = 1500;

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

    const modelResults: ModelResult[] = [];

    // Process in chunks to avoid rate limiting
    const chunks: ModelEntry[][] = [];
    for (let i = 0; i < models.length; i += CONCURRENCY_LIMIT) {
      chunks.push(models.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];

      const results = await Promise.allSettled(
        chunk.map(async (entry): Promise<ModelResult> => {
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

      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          modelResults.push(settled.value);
        } else {
          const entry = chunk[results.indexOf(settled)];
          modelResults.push({
            modelId: entry?.modelId,
            images: [],
            error: (settled.reason as Error)?.message || 'Unknown error',
          });
        }
      }

      // Delay between chunks (skip after last)
      if (chunkIdx < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
    }

    const succeeded = modelResults.filter((r) => r.images.length > 0).length;
    const failed = modelResults.filter((r) => r.images.length === 0).length;

    console.log(`[FirstFrame Batch] ${succeeded} succeeded, ${failed} failed out of ${models.length} (chunked: ${CONCURRENCY_LIMIT} concurrent, ${CHUNK_DELAY_MS}ms delay)`);

    return NextResponse.json({ results: modelResults });
  } catch (error) {
    console.error('Generate first frame batch error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
