import { fetchInstagramProfileByUsername, fetchInstagramReels } from './instagram';
import { resolveTikTokUser, fetchTikTokPosts } from './tiktok';
import { resolveYouTubeChannel, fetchYouTubeVideos } from './youtube';
import {
  updateAnalyticsAccount,
  upsertMediaItem,
  upsertAccountSnapshot,
  upsertMediaSnapshot,
  getAccountMediaTotals,
} from '../db-analytics';

type AccountRow = {
  id: string;
  platform: string;
  username: string;
  account_id?: string;
};

export async function syncAccount(account: AccountRow) {
  const { id, platform, username } = account;

  try {
    switch (platform) {
      case 'instagram': await syncInstagram(id, username, account.account_id); break;
      case 'tiktok':    await syncTikTok(id, username, account.account_id); break;
      case 'youtube':   await syncYouTube(id, username, account.account_id); break;
      default: throw new Error(`Unsupported platform: ${platform}`);
    }
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[analytics] sync failed for ${platform}/${username}:`, message);
    return { success: false, error: message };
  }
}

async function syncInstagram(accountDbId: string, username: string, existingUserId?: string) {
  // Single /profile call gets userId + profile stats (replaces /id + /profile2)
  const profile = await fetchInstagramProfileByUsername(username);
  const userId = existingUserId || profile.userId;

  // Fetch ALL reels (paginate until done)
  const reels = await fetchInstagramReels(userId);

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
    await upsertMediaSnapshot(mediaItem.id, {
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      engagementRate: mediaEngagement,
    });
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

async function syncTikTok(accountDbId: string, username: string, existingSecUid?: string) {
  const userInfo = await resolveTikTokUser(username);
  const secUid = existingSecUid || userInfo.secUid;

  // Fetch ALL posts (paginate until done)
  const posts = await fetchTikTokPosts(secUid);

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
    await upsertMediaSnapshot(mediaItem.id, {
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      engagementRate: mediaEngagement,
    });
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

async function syncYouTube(accountDbId: string, identifier: string, existingChannelId?: string) {
  const channel = await resolveYouTubeChannel(existingChannelId || identifier);

  // Pass uploadsPlaylistId directly — no duplicate channel fetch
  const videos = await fetchYouTubeVideos(channel.uploadsPlaylistId);

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
    await upsertMediaSnapshot(mediaItem.id, {
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: 0,
      engagementRate: mediaEngagement,
    });
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
 * Much faster than sequential — 1000 accounts in ~7 min vs ~33 min.
 */
export async function syncAllAccounts(accounts: AccountRow[]) {
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((account) => syncAccount(account))
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
