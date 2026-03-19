import { describe, expect, it } from 'vitest';
import { buildLateAnalyticsFallbackPosts } from '@/lib/late-analytics-local-posts';

describe('buildLateAnalyticsFallbackPosts', () => {
  it('groups local platform rows into one analytics post and keeps job variables', () => {
    const posts = buildLateAnalyticsFallbackPosts({
      rows: [
        {
          id: 'row-1',
          jobId: 'job-1',
          lateAccountId: 'acct-1',
          caption: 'Video A',
          platform: 'instagram',
          latePostId: 'late-1',
          externalPostId: 'ig-1',
          platformPostUrl: 'https://instagram.com/p/1',
          publishedAt: '2026-03-18T10:00:00.000Z',
          accountUsername: 'creator_a',
        },
        {
          id: 'row-2',
          jobId: 'job-1',
          lateAccountId: 'acct-2',
          caption: 'Video A',
          platform: 'tiktok',
          latePostId: 'late-1',
          externalPostId: 'tt-1',
          platformPostUrl: 'https://tiktok.com/@creator_a/video/1',
          publishedAt: '2026-03-18T10:02:00.000Z',
          accountUsername: '@creator_a',
        },
      ],
      jobVariableValuesByJobId: {
        'job-1': {
          'Runable Integration': 'true',
        },
      },
      fromDate: '2026-03-18',
      toDate: '2026-03-18',
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]._id).toBe('late-1');
    expect(posts[0].publishedAt).toBe('2026-03-18T10:00:00.000Z');
    expect(posts[0].platforms).toHaveLength(2);
    expect(posts[0].platforms.map((platform) => platform.accountUsername)).toEqual(['creator_a', 'creator_a']);
    expect(posts[0].variableValues).toEqual({ 'Runable Integration': 'true' });
  });

  it('uses local timestamps when publishedAt was not saved yet', () => {
    const posts = buildLateAnalyticsFallbackPosts({
      rows: [
        {
          id: 'row-1',
          latePostId: 'late-2',
          platform: 'instagram',
          createdAt: '2026-03-18T20:00:00.000Z',
        },
      ],
      fromDate: '2026-03-19',
      toDate: '2026-03-19',
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].publishedAt).toBe('2026-03-18T20:00:00.000Z');
  });

  it('skips local fallback posts that already exist in remote analytics', () => {
    const posts = buildLateAnalyticsFallbackPosts({
      rows: [
        {
          id: 'row-1',
          latePostId: 'late-3',
          externalPostId: 'ext-3',
          publishedAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      existingExternalIds: ['ext-3'],
      fromDate: '2026-03-18',
      toDate: '2026-03-18',
    });

    expect(posts).toHaveLength(0);
  });
});
