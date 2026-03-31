import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFirstFrameRequest } from '../api';

function mockJsonResponse(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('generateFirstFrameRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries transient provider failures before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(false, 500, { error: 'Gemini returned no image data' }))
      .mockResolvedValueOnce(mockJsonResponse(false, 503, { error: 'Service unavailable' }))
      .mockResolvedValueOnce(mockJsonResponse(true, 200, {
        images: [{ url: 'https://example.com/out.jpg', gcsUrl: 'gs://bucket/out.jpg' }],
      }));

    vi.stubGlobal('fetch', fetchMock);

    const promise = generateFirstFrameRequest({
      modelImageUrl: 'https://example.com/model.jpg',
      frameImageUrl: 'https://example.com/frame.jpg',
      resolution: '1K',
      provider: 'gemini-pro',
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual([
      { url: 'https://example.com/out.jpg', gcsUrl: 'gs://bucket/out.jpg' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry validation failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(false, 400, { error: 'Both modelImageUrl and frameImageUrl are required' }));

    vi.stubGlobal('fetch', fetchMock);

    const promise = generateFirstFrameRequest({
      modelImageUrl: '',
      frameImageUrl: '',
      resolution: '1K',
      provider: 'fal',
    });

    await expect(promise).rejects.toThrow('Both modelImageUrl and frameImageUrl are required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
