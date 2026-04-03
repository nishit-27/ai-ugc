import type { QueueState } from './types';

export const FIRST_FRAME_BATCH_CONCURRENCY = 20;
export const FIRST_FRAME_BATCH_DELAY_MS = 200;

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

  const ids = items.map((item) => getId(item));
  const queueState: QueueState = {};
  ids.forEach((id, index) => {
    queueState[id] = { status: 'queued', position: index + 1 };
  });

  const syncQueuedPositions = () => {
    let queuedPosition = 1;
    for (const id of ids) {
      const entry = queueState[id];
      if (entry?.status === 'queued') {
        queueState[id] = { status: 'queued', position: queuedPosition++ };
      }
    }
  };

  const emitQueueState = () => {
    syncQueuedPositions();
    onQueueStateChange?.({ ...queueState });
  };

  if (total > 0) {
    emitQueueState();
  }

  let done = 0;
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
      if (delayMs > 0) {
        const waitMs = Math.max(0, lastLaunchAt + delayMs - Date.now());
        if (waitMs > 0) {
          await delay(waitMs);
        }
      }
      lastLaunchAt = Date.now();
    } finally {
      releaseCurrentGate();
    }
  };

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        return;
      }

      const item = items[currentIndex];
      const id = ids[currentIndex];

      await waitForLaunchSlot();
      queueState[id] = { status: 'generating' };
      emitQueueState();

      try {
        await worker(item);
        queueState[id] = { status: 'done' };
      } catch {
        queueState[id] = { status: 'failed' };
      } finally {
        done += 1;
        onProgress?.(Math.min(done, total), total);
        emitQueueState();
      }
    }
  };

  await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, total) }, () => runWorker()),
  );
}
