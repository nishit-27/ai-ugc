/**
 * Late API analytics sync — persists the data shown on `/late-analytics` into
 * our own analytics_* tables so the DB stays current without hitting the Late
 * API at read time.
 *
 * Triggered by:
 *   - POST /api/late-analytics/sync    → manual "sync now" from the dashboard
 *   - GET  /api/late-analytics/sync    → Vercel cron (daily)
 */

import { getApiKeys, fetchFromAllKeys } from '@/lib/lateAccountPool';
import { lateApiRequest } from '@/lib/lateApi';
import {
  extractLateAnalyticsPosts,
  normalizeLateAnalyticsPost,
  type NormalizedLateAnalyticsPost,
} from '@/lib/late-analytics-normalize';
import {
  ensureDatabaseReady,
  getAllAnalyticsAccounts,
  upsertMediaItem,
  upsertMediaSnapshot,
  upsertAccountSnapshot,
  updateAnalyticsAccount,
  getAccountMediaTotals,
} from '@/lib/db';

const PAGE_SIZE = 100;
const PARALLEL_PAGES = 10;

type LateSyncResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  apiKeysUsed: number;
  postsFetched: number;
  platformEntriesSeen: number;
  mediaItemsUpserted: number;
  snapshotsUpserted: number;
  accountsMatched: number;
  accountsRefreshed: number;
  followersRefreshed: number;
  unmatchedPlatformEntries: number;
  errors: string[];
};

type LateFollowerStat = {
  _id?: string;
  accountId?: string;
  id?: string;
  platform?: string;
  username?: string;
  followers?: number;
  followerCount?: number;
  subscriberCount?: number;
  metrics?: { followers?: number; followerCount?: number; subscriberCount?: number };
};

function pickFollowerCount(stat: LateFollowerStat): number {
  const raw =
    stat.followers ??
    stat.followerCount ??
    stat.subscriberCount ??
    stat.metrics?.followers ??
    stat.metrics?.followerCount ??
    stat.metrics?.subscriberCount ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

async function fetchAllFollowerStats(): Promise<Map<string, LateFollowerStat>> {
  const out = new Map<string, LateFollowerStat>();
  try {
    const results = await fetchFromAllKeys<{ accounts?: LateFollowerStat[] }>(
      '/accounts/follower-stats',
    );
    for (const { data } of results) {
      const items: LateFollowerStat[] = Array.isArray(data)
        ? (data as LateFollowerStat[])
        : data?.accounts || [];
      for (const item of items) {
        const id = item._id || item.accountId || item.id;
        if (!id) continue;
        if (!out.has(id)) out.set(id, item);
      }
    }
  } catch (err) {
    // Don't abort the whole sync if follower-stats endpoint is flaky.
    console.error('[late-sync] follower-stats fetch failed:', err);
  }
  return out;
}

type AnalyticsAccount = {
  id: string;
  platform: string;
  username: string;
  late_account_id: string | null;
};

async function fetchAllLatePosts(): Promise<NormalizedLateAnalyticsPost[]> {
  const keys = getApiKeys();
  if (keys.length === 0) return [];

  const rawPosts: ReturnType<typeof extractLateAnalyticsPosts> = [];

  const keyResults = await Promise.allSettled(
    keys.map(async (apiKey) => {
      const firstPage = await lateApiRequest<unknown>(
        `/analytics?limit=${PAGE_SIZE}&page=1&sortBy=date&order=desc`,
        { apiKey },
      );
      const firstPosts = extractLateAnalyticsPosts(firstPage);
      const firstPageData = firstPage as { overview?: { totalPosts?: number } };
      const total = firstPageData?.overview?.totalPosts || firstPosts.length;
      const totalPages = Math.ceil(total / PAGE_SIZE);

      const collected = [...firstPosts];
      if (totalPages <= 1) return collected;

      const remaining: number[] = [];
      for (let p = 2; p <= totalPages; p++) remaining.push(p);

      for (let i = 0; i < remaining.length; i += PARALLEL_PAGES) {
        const batch = remaining.slice(i, i + PARALLEL_PAGES);
        const results = await Promise.allSettled(
          batch.map((page) =>
            lateApiRequest<unknown>(
              `/analytics?limit=${PAGE_SIZE}&page=${page}&sortBy=date&order=desc`,
              { apiKey },
            ),
          ),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') collected.push(...extractLateAnalyticsPosts(r.value));
        }
      }
      return collected;
    }),
  );

  for (const result of keyResults) {
    if (result.status === 'fulfilled') rawPosts.push(...result.value);
  }

  return rawPosts.map(normalizeLateAnalyticsPost);
}

function buildAccountIndex(accounts: AnalyticsAccount[]) {
  const byLateId = new Map<string, AnalyticsAccount>();
  const byPlatformUsername = new Map<string, AnalyticsAccount>();
  for (const a of accounts) {
    if (a.late_account_id) byLateId.set(a.late_account_id, a);
    if (a.username) byPlatformUsername.set(`${a.platform}:${a.username.toLowerCase()}`, a);
  }
  return { byLateId, byPlatformUsername };
}

export async function syncLateAnalyticsToDb(): Promise<LateSyncResult> {
  const startedAt = new Date();
  const result: LateSyncResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
    apiKeysUsed: getApiKeys().length,
    postsFetched: 0,
    platformEntriesSeen: 0,
    mediaItemsUpserted: 0,
    snapshotsUpserted: 0,
    accountsMatched: 0,
    accountsRefreshed: 0,
    followersRefreshed: 0,
    unmatchedPlatformEntries: 0,
    errors: [],
  };


  await ensureDatabaseReady();
  const accounts = (await getAllAnalyticsAccounts()) as AnalyticsAccount[];
  const { byLateId, byPlatformUsername } = buildAccountIndex(accounts);

  const [posts, followerStatsById] = await Promise.all([
    fetchAllLatePosts(),
    fetchAllFollowerStats(),
  ]);
  result.postsFetched = posts.length;

  for (const post of posts) {
    for (const platformEntry of post.platforms) {
      result.platformEntriesSeen += 1;

      // Match to one of our analytics_accounts rows.
      let account: AnalyticsAccount | undefined;
      if (platformEntry.accountId) account = byLateId.get(platformEntry.accountId);
      if (!account && platformEntry.platform && platformEntry.accountUsername) {
        account = byPlatformUsername.get(
          `${platformEntry.platform}:${platformEntry.accountUsername.toLowerCase()}`,
        );
      }
      if (!account) {
        result.unmatchedPlatformEntries += 1;
        continue;
      }
      result.accountsMatched += 1;

      const externalId =
        platformEntry.platformPostId || post._id || post.postId;
      if (!externalId) continue;

      const metrics = platformEntry.analytics;
      const publishedAt = platformEntry.publishedAt || post.publishedAt || null;
      const url = platformEntry.platformPostUrl || post.platformPostUrl || null;

      try {
        const media = await upsertMediaItem({
          accountId: account.id,
          platform: account.platform,
          externalId,
          title: null,
          caption: post.content || null,
          url,
          thumbnailUrl: post.thumbnailUrl || null,
          publishedAt,
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saves: metrics.saves,
          engagementRate: metrics.engagementRate,
          metadata: {
            source: 'late',
            latePostId: post._id,
            impressions: metrics.impressions,
            reach: metrics.reach,
            clicks: metrics.clicks,
          },
        });
        result.mediaItemsUpserted += 1;

        if (media?.id) {
          await upsertMediaSnapshot(media.id, {
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            engagementRate: metrics.engagementRate,
          });
          result.snapshotsUpserted += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`upsert failed for ${externalId}: ${message}`);
      }
    }
  }

  // Refresh EVERY account we know about, not just the ones Late returned posts
  // for — this bumps last_synced_at on the whole set and writes a fresh
  // account-level snapshot today so the freshness UI doesn't lie.
  for (const account of accounts) {
    try {
      const totals = await getAccountMediaTotals(account.id);
      const interactions =
        (totals.totalLikes || 0) + (totals.totalComments || 0) + (totals.totalShares || 0);
      const engagementRate =
        totals.totalViews > 0 ? (interactions / totals.totalViews) * 100 : 0;

      const lateFollowerStat = account.late_account_id
        ? followerStatsById.get(account.late_account_id)
        : undefined;
      const followers = lateFollowerStat ? pickFollowerCount(lateFollowerStat) : 0;
      if (followers > 0) result.followersRefreshed += 1;

      await updateAnalyticsAccount(account.id, {
        totalViews: totals.totalViews,
        totalLikes: totals.totalLikes,
        totalComments: totals.totalComments,
        totalShares: totals.totalShares,
        engagementRate,
        ...(followers > 0 ? { followers } : {}),
      });

      await upsertAccountSnapshot(account.id, {
        followers, // 0 if Late didn't return a number — COALESCE-safe
        totalViews: totals.totalViews,
        totalLikes: totals.totalLikes,
        totalComments: totals.totalComments,
        totalShares: totals.totalShares,
        engagementRate,
      });
      result.accountsRefreshed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`account refresh failed for ${account.id}: ${message}`);
    }
  }

  const finishedAt = new Date();
  result.finishedAt = finishedAt.toISOString();
  result.durationMs = finishedAt.getTime() - startedAt.getTime();
  return result;
}
