import { NextResponse } from 'next/server';
import { retry } from '@/lib/retry';

export const maxDuration = 300;

const CONCURRENCY_LIMIT = 20;
const REQUEST_DELAY_MS = 200;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBatchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return [
    'http 408',
    'http 425',
    'http 429',
    'http 500',
    'http 502',
    'http 503',
    'http 504',
    'fetch failed',
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'timeout',
    'timed out',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
  ].some((fragment) => normalized.includes(fragment));
}

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

type ImageResult = {
  url: string;
  gcsUrl: string;
  reviewStatus?: 'match' | 'mismatch' | 'unknown';
  reviewLabel?: string | null;
  reviewReason?: string | null;
  reviewConfidence?: number | null;
};
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

    const modelResults = new Array<ModelResult>(models.length);
    let nextIndex = 0;
    let lastLaunchAt = 0;
    let launchGate = Promise.resolve();

    const waitForLaunchSlot = async () => {
      const previousGate = launchGate;
      let releaseCurrentGate = () => {};
      launchGate = new Promise<void>((resolve) => {
        releaseCurrentGate = resolve;
      });

      await previousGate;
      try {
        const waitMs = Math.max(0, lastLaunchAt + REQUEST_DELAY_MS - Date.now());
        if (waitMs > 0) {
          await delay(waitMs);
        }
        lastLaunchAt = Date.now();
      } finally {
        releaseCurrentGate();
      }
    };

    const processEntry = async (entry: ModelEntry): Promise<ModelResult> => {
      return retry(
        async () => {
          await waitForLaunchSlot();
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
            const message = data.error || `HTTP ${res.status}`;
            if (RETRYABLE_STATUS_CODES.has(res.status)) {
              throw new Error(`HTTP ${res.status}: ${message}`);
            }
            return {
              modelId: entry.modelId,
              images: [],
              error: message,
            };
          }

          return {
            modelId: entry.modelId,
            images: data.images || [],
          };
        },
        {
          retries: 2,
          delaysMs: [1000, 2500],
          shouldRetry: isRetryableBatchError,
        },
      );
    };

    const runWorker = async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= models.length) {
          return;
        }

        const entry = models[currentIndex];

        try {
          modelResults[currentIndex] = await processEntry(entry);
        } catch (error) {
          modelResults[currentIndex] = {
            modelId: entry.modelId,
            images: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    };

    await Promise.allSettled(
      Array.from({ length: Math.min(CONCURRENCY_LIMIT, models.length) }, () => runWorker()),
    );

    const succeeded = modelResults.filter((r) => r.images.length > 0).length;
    const failed = modelResults.filter((r) => r.images.length === 0).length;

    console.log(`[FirstFrame Batch] ${succeeded} succeeded, ${failed} failed out of ${models.length} (paced: ${CONCURRENCY_LIMIT} concurrent, ${REQUEST_DELAY_MS}ms launch delay)`);

    return NextResponse.json({ results: modelResults });
  } catch (error) {
    console.error('Generate first frame batch error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
