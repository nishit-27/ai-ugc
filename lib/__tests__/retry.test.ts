import { describe, expect, it, vi } from 'vitest';
import { isRetryableError, retry } from '@/lib/retry';

describe('retry', () => {
  it('retries retryable errors until success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('other side closed'))
      .mockResolvedValue('ok');

    await expect(retry(fn, { delaysMs: [0, 0, 0] })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('validation failed'));

    await expect(retry(fn, { delaysMs: [0, 0, 0] })).rejects.toThrow('validation failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryableError', () => {
  it('detects nested network causes', () => {
    const error = new Error('database query failed', {
      cause: new Error('fetch failed', {
        cause: new Error('other side closed'),
      }),
    });

    expect(isRetryableError(error)).toBe(true);
  });
});
