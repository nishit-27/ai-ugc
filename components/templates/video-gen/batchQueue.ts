import type { QueueState } from './types';

export const FIRST_FRAME_BATCH_CONCURRENCY = 2;
export const FIRST_FRAME_BATCH_DELAY_MS = 1500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runFirstFrameBatchQueue<TItem>(params: {
  items: TItem[];
  getId: (item: TItem) => string;
  worker: (item: TItem) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  onQueueStateChange?: (state: QueueState) => void;
  concurrency?: number;
  delayMs?: number;
}) {
  const {
    items,
    getId,
    worker,
    onProgress,
    onQueueStateChange,
    concurrency = FIRST_FRAME_BATCH_CONCURRENCY,
    delayMs = FIRST_FRAME_BATCH_DELAY_MS,
  } = params;

  const total = items.length;
  onProgress?.(0, total);

  const queueState: QueueState = {};
  items.forEach((item, index) => {
    queueState[getId(item)] = { status: 'queued', position: index + 1 };
  });
  if (total > 0) {
    onQueueStateChange?.({ ...queueState });
  }

  let done = 0;
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);

    for (const item of chunk) {
      queueState[getId(item)] = { status: 'generating' };
    }
    onQueueStateChange?.({ ...queueState });

    const results = await Promise.allSettled(chunk.map((item) => worker(item)));
    results.forEach((result, resultIndex) => {
      const item = chunk[resultIndex];
      queueState[getId(item)] = { status: result.status === 'fulfilled' ? 'done' : 'failed' };
      done += 1;
      onProgress?.(Math.min(done, total), total);
    });
    onQueueStateChange?.({ ...queueState });

    if (index + concurrency < items.length) {
      await delay(delayMs);
    }
  }
}
