import { describe, expect, it } from 'vitest';
import {
  extractLateAnalyticsPosts,
  normalizeLateAnalyticsListParams,
  normalizeLateAnalyticsPost,
} from '@/lib/late-analytics-normalize';

describe('normalizeLateAnalyticsListParams', () => {
  it('translates legacy analytics query params to the current API shape', () => {
    const params = new URLSearchParams({
      sortBy: 'publishedAt',
      sortDirection: 'desc',
      fromDate: '2026-02-01',
      toDate: '2026-03-01',
      platform: 'instagram',
    });

    const normalized = normalizeLateAnalyticsListParams(params);

    expect(normalized.get('sortBy')).toBe('date');
    expect(normalized.get('order')).toBe('desc');
    expect(normalized.get('platform')).toBe('instagram');
    expect(normalized.get('fromDate')).toBe('2026-02-01');
    expect(normalized.get('toDate')).toBe('2026-03-01');
  });
});

describe('extractLateAnalyticsPosts', () => {
  it('reads posts from nested data payloads', () => {
    const payload = { data: { posts: [{ _id: 'p1' }] } };
    expect(extractLateAnalyticsPosts(payload)).toEqual([{ _id: 'p1' }]);
  });
});

describe('normalizeLateAnalyticsPost', () => {
  it('maps platformAnalytics payloads into the UI post shape', () => {
    const normalized = normalizeLateAnalyticsPost({
      _id: 'post_123',
      content: 'Hello world',
      mediaItems: [{ thumbnailUrl: 'https://cdn.example.com/thumb.jpg' }],
      platformAnalytics: [
        {
          platform: 'instagram',
          profileId: { _id: 'acct_1' },
          accountUsername: '@maya.scott',
          platformPostId: 'ig_abc123',
          platformPostUrl: 'https://instagram.com/p/abc',
          publishedAt: '2026-03-10T10:00:00.000Z',
          analytics: {
            views: 1200,
            likes: 140,
            comments: 8,
            shares: 5,
          },
        },
      ],
    });

    expect(normalized.postId).toBe('post_123');
    expect(normalized.publishedAt).toBe('2026-03-10T10:00:00.000Z');
    expect(normalized.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(normalized.analytics.views).toBe(1200);
    expect(normalized.platforms).toEqual([
      expect.objectContaining({
        platform: 'instagram',
        accountId: 'acct_1',
        accountUsername: 'maya.scott',
        platformPostId: 'ig_abc123',
      }),
    ]);
  });
});
