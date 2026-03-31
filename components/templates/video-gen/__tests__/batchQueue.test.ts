import { describe, expect, it } from 'vitest';
import { runFirstFrameBatchQueue } from '../batchQueue';
import type { QueueState } from '../types';

describe('runFirstFrameBatchQueue', () => {
  it('limits concurrency and reports queue progress/status', async () => {
    const states: QueueState[] = [];
    const progress: Array<[number, number]> = [];
    let active = 0;
    let maxActive = 0;

    await runFirstFrameBatchQueue({
      items: ['a', 'b', 'c', 'd', 'e'],
      getId: (item) => item,
      delayMs: 0,
      onProgress: (done, total) => progress.push([done, total]),
      onQueueStateChange: (state) => {
        states.push(JSON.parse(JSON.stringify(state)) as QueueState);
      },
      worker: async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;

        if (item === 'c') {
          throw new Error('boom');
        }
      },
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(progress).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    expect(states[0]).toEqual({
      a: { status: 'queued', position: 1 },
      b: { status: 'queued', position: 2 },
      c: { status: 'queued', position: 3 },
      d: { status: 'queued', position: 4 },
      e: { status: 'queued', position: 5 },
    });
    expect(states.at(-1)).toEqual({
      a: { status: 'done' },
      b: { status: 'done' },
      c: { status: 'failed' },
      d: { status: 'done' },
      e: { status: 'done' },
    });
  });
});
