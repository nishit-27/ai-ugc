'use client';

import { useCallback } from 'react';

export type SubmitPostBody = {
  videoUrl: string;
  caption: string;
  platforms: Array<{ platform: string; accountId: string; apiKeyIndex?: number }>;
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  scheduledFor?: string;
  timezone?: string;
  forceRepost?: boolean;
  forceToken?: string;
  dedupeKey?: string;
};

// `data` is intentionally loose — the route's response shape varies
// across modes (per-platform results, partial failures, idempotent
// duplicates), and the caller reads various fields like `.success`,
// `.message`, `.error`, `.details`.
export type SubmitPostResult = {
  ok: boolean;
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

// Returns a raw result instead of throwing — CreatePostModal needs the
// response body even on failure to surface API-side `details`.
export function useSubmitPost() {
  const submit = useCallback(async (body: SubmitPostBody): Promise<SubmitPostResult> => {
    const res = await fetch('/api/posts/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }, []);
  return { submit };
}
