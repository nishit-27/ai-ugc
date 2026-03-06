import { fetchInstagramProfileByUsername, fetchInstagramReels } from './instagram';
import { resolveTikTokUser, fetchTikTokPosts } from './tiktok';
import { resolveYouTubeChannel, fetchYouTubeVideos } from './youtube';
import {
  updateAnalyticsAccount,
  upsertMediaItem,
  upsertAccountSnapshot,
  upsertMediaSnapshot,
  getAccountMediaTotals,
  getMediaExternalIds,
  getLatestPostDate,
  linkMediaItemToJob,
} from '../db-analytics';

/**
 * Sync modes:
 * - 'light': Incremental — only fetch new posts + update metrics for last 60 days.
 *            Skips stale accounts (no new posts in 7 days) — profile-only update.
 *            Used by daily cron.
 * - 'full':  Fetch all posts but still cap metric snapshots to 60 days.
 *            Used by manual Hard Sync.
 */
export type SyncMode = 'light' | 'full';

const METRIC_CAP_DAYS = 60;
const STALE_ACCOUNT_DAYS = 7;

type AccountRow = {
  id: string;
  platform: string;
  username: string;
  account_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
};

function getCutoffDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - METRIC_CAP_DAYS);
  return d;
}

function isPostWithinCap(publishedAt: string | null): boolean {
  if (!publishedAt) return true; // no date = treat as recent
  return new Date(publishedAt) >= getCutoffDate();
}

export async function syncAccount(account: AccountRow, mode: SyncMode = 'full') {
  const { id, platform, username } = account;

  try {
    switch (platform) {
      case 'instagram': await syncInstagram(id, username, account.account_id, mode); break;
      case 'tiktok':    await syncTikTok(id, username, account.account_id, mode); break;
      case 'youtube':   await syncYouTube(id, username, account.account_id, mode, account.metadata); break;
      default: throw new Error(`Unsupported platform: ${platform}`);
    }
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[analytics] sync failed for ${platform}/${username}:`, message);
    return { success: false, error: message };
  }
}

/**
 * In light mode, check if account is stale (no new posts in STALE_ACCOUNT_DAYS).
 * Returns true if we should skip post fetching and only update profile.
 */
async function isAccountStale(accountDbId: string): Promise<boolean> {
  const latestPost = await getLatestPostDate(accountDbId);
  if (!latestPost) return false; // new account, never synced — fetch everything
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - STALE_ACCOUNT_DAYS);
  return latestPost < staleCutoff;
}

async function syncInstagram(accountDbId: string, username: string, existingUserId?: string, mode: SyncMode = 'full') {
  const profile = await fetchInstagramProfileByUsername(username);
  const userId = existingUserId || profile.userId;

  const cutoffDate = getCutoffDate();
  const stale = mode === 'light' && await isAccountStale(accountDbId);

  let reels: Awaited<ReturnType<typeof fetchInstagramReels>> = [];

  if (stale) {
    console.log(`[analytics] Skipping post fetch for stale Instagram account @${username} (light mode)`);
  } else {
    const fetchOpts = mode === 'light'
      ? { knownIds: await getMediaExternalIds(accountDbId), cutoffDate, maxPages: 3 }
      : undefined;
    reels = await fetchInstagramReels(userId, fetchOpts);
  }

  for (const r of reels) {
    const interactions = r.likes + r.comments + r.shares;
    const mediaEngagement = r.views > 0 ? (interactions / r.views) * 100 : 0;
    const mediaItem = await upsertMediaItem({
      accountId: accountDbId,
      platform: 'instagram',
      externalId: r.externalId,
      title: null,
      caption: r.caption,
      url: r.url,
      thumbnailUrl: r.thumbnailUrl,
      publishedAt: r.publishedAt || null,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      saves: r.saves,
      engagementRate: mediaEngagement,
      metadata: null,
    });
    if (!mediaItem.template_job_id) {
      await linkMediaItemToJob(mediaItem.id, mediaItem.external_id, accountDbId);
    }
    // Only write metric snapshots for posts within 60-day cap
    if (isPostWithinCap(r.publishedAt)) {
      await upsertMediaSnapshot(mediaItem.id, {
        views: r.views, likes: r.likes, comments: r.comments,
        shares: r.shares, engagementRate: mediaEngagement,
      });
    }
  }

  const totals = await getAccountMediaTotals(accountDbId);
  const totalInteractions = totals.totalLikes + totals.totalComments + totals.totalShares;
  const engagementRate = totals.totalViews > 0 ? (totalInteractions / totals.totalViews) * 100 : 0;

  await updateAnalyticsAccount(accountDbId, {
    accountId: userId,
    displayName: profile.displayName,
    profileUrl: profile.profileUrl,
    followers: profile.followers,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
    metadata: { following: profile.following, mediaCount: profile.mediaCount, totalSaves: totals.totalSaves },
  });

  await upsertAccountSnapshot(accountDbId, {
    followers: profile.followers,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
  });
}

async function syncTikTok(accountDbId: string, username: string, existingSecUid?: string, mode: SyncMode = 'full') {
  const userInfo = await resolveTikTokUser(username);
  const secUid = existingSecUid || userInfo.secUid;

  const cutoffDate = getCutoffDate();
  const stale = mode === 'light' && await isAccountStale(accountDbId);

  let posts: Awaited<ReturnType<typeof fetchTikTokPosts>> = [];

  if (stale) {
    console.log(`[analytics] Skipping post fetch for stale TikTok account @${username} (light mode)`);
  } else {
    const fetchOpts = mode === 'light'
      ? { knownIds: await getMediaExternalIds(accountDbId), cutoffDate, maxPages: 3 }
      : undefined;
    posts = await fetchTikTokPosts(secUid, fetchOpts);
  }

  for (const p of posts) {
    const interactions = p.likes + p.comments + p.shares;
    const mediaEngagement = p.views > 0 ? (interactions / p.views) * 100 : 0;
    const mediaItem = await upsertMediaItem({
      accountId: accountDbId,
      platform: 'tiktok',
      externalId: p.externalId,
      title: null,
      caption: p.caption,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt || null,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: 0,
      engagementRate: mediaEngagement,
      metadata: null,
    });
    if (!mediaItem.template_job_id) {
      await linkMediaItemToJob(mediaItem.id, mediaItem.external_id, accountDbId);
    }
    // Only write metric snapshots for posts within 60-day cap
    if (isPostWithinCap(p.publishedAt)) {
      await upsertMediaSnapshot(mediaItem.id, {
        views: p.views, likes: p.likes, comments: p.comments,
        shares: p.shares, engagementRate: mediaEngagement,
      });
    }
  }

  const totals = await getAccountMediaTotals(accountDbId);
  const totalInteractions = totals.totalLikes + totals.totalComments + totals.totalShares;
  const engagementRate = totals.totalViews > 0 ? (totalInteractions / totals.totalViews) * 100 : 0;

  await updateAnalyticsAccount(accountDbId, {
    accountId: userInfo.secUid,
    displayName: userInfo.displayName,
    profileUrl: userInfo.profileUrl,
    followers: userInfo.followers,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
    metadata: { following: userInfo.following, heartCount: userInfo.likes, videoCount: userInfo.videoCount },
  });

  await upsertAccountSnapshot(accountDbId, {
    followers: userInfo.followers,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncYouTube(accountDbId: string, identifier: string, existingChannelId?: string, mode: SyncMode = 'full', metadata?: any) {
  // Use cached uploadsPlaylistId from metadata to skip playlist discovery
  const cachedPlaylistId = metadata?.uploadsPlaylistId;

  const channel = await resolveYouTubeChannel(existingChannelId || identifier);
  const uploadsPlaylistId = cachedPlaylistId || channel.uploadsPlaylistId;

  const cutoffDate = getCutoffDate();
  const stale = mode === 'light' && await isAccountStale(accountDbId);

  let videos: Awaited<ReturnType<typeof fetchYouTubeVideos>> = [];

  if (stale) {
    console.log(`[analytics] Skipping video fetch for stale YouTube channel ${identifier} (light mode)`);
  } else {
    const fetchOpts = mode === 'light'
      ? { knownIds: await getMediaExternalIds(accountDbId), cutoffDate, maxPages: 2 }
      : undefined;
    videos = await fetchYouTubeVideos(uploadsPlaylistId, fetchOpts);
  }

  for (const v of videos) {
    const interactions = v.likes + v.comments;
    const mediaEngagement = v.views > 0 ? (interactions / v.views) * 100 : 0;
    const mediaItem = await upsertMediaItem({
      accountId: accountDbId,
      platform: 'youtube',
      externalId: v.externalId,
      title: v.title,
      caption: v.caption,
      url: v.url,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: v.publishedAt || null,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: 0,
      saves: 0,
      engagementRate: mediaEngagement,
      metadata: null,
    });
    if (!mediaItem.template_job_id) {
      await linkMediaItemToJob(mediaItem.id, mediaItem.external_id, accountDbId);
    }
    // Only write metric snapshots for videos within 60-day cap
    if (isPostWithinCap(v.publishedAt)) {
      await upsertMediaSnapshot(mediaItem.id, {
        views: v.views, likes: v.likes, comments: v.comments,
        shares: 0, engagementRate: mediaEngagement,
      });
    }
  }

  const totals = await getAccountMediaTotals(accountDbId);
  const totalInteractions = totals.totalLikes + totals.totalComments;
  const engagementRate = totals.totalViews > 0 ? (totalInteractions / totals.totalViews) * 100 : 0;

  await updateAnalyticsAccount(accountDbId, {
    accountId: channel.channelId,
    displayName: channel.title,
    profileUrl: channel.thumbnailUrl,
    followers: channel.subscriberCount,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
    metadata: { channelVideoCount: channel.videoCount, channelViewCount: channel.viewCount, uploadsPlaylistId: channel.uploadsPlaylistId },
  });

  await upsertAccountSnapshot(accountDbId, {
    followers: channel.subscriberCount,
    totalViews: totals.totalViews,
    totalLikes: totals.totalLikes,
    totalComments: totals.totalComments,
    totalShares: totals.totalShares,
    engagementRate,
  });
}

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

/**
 * Sync all accounts in parallel batches of 5.
 * @param mode 'light' = incremental daily sync, 'full' = manual hard sync
 */
export async function syncAllAccounts(accounts: AccountRow[], mode: SyncMode = 'full') {
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((account) => syncAccount(account, mode))
    );

    for (let j = 0; j < batch.length; j++) {
      const settled = batchResults[j];
      if (settled.status === 'fulfilled') {
        results.push({ id: batch[j].id, ...settled.value });
      } else {
        const errMsg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        results.push({ id: batch[j].id, success: false, error: errMsg });
      }
    }

    // Delay between batches (not after the last one)
    if (i + BATCH_SIZE < accounts.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return results;
}
