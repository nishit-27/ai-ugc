#!/usr/bin/env node
// One-off runner: pulls everything Late knows about and upserts it into the DB.
// Run with:  node --env-file=.env scripts/sync-late-now.mjs
//
// Mirrors lib/analytics/lateSync.ts exactly — duplicated here only so we can
// execute it outside the Next.js bundler (no @/ path aliases, no route needed).

import { neon } from '@neondatabase/serverless';

const PAGE_SIZE = 100;
const PARALLEL_PAGES = 10;

const LATE_API_URL =
  process.env.ZERNIO_API_URL || process.env.LATE_API_URL || 'https://zernio.com/api/v1';
const API_KEYS = (process.env.ZERNIO_API_KEYS || process.env.LATE_API_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('No LATE_API_KEYS / ZERNIO_API_KEYS configured. Aborting.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Aborting.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function lateGet(path, apiKey) {
  const url = `${LATE_API_URL}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Late ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeUsername(v) {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^@+/, '');
}

function toId(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v._id === 'string') return v._id;
  return '';
}

function extractPosts(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.posts)) return payload.posts;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.data && Array.isArray(payload.data.posts)) return payload.data.posts;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

function normalizeMetrics(src) {
  const m = src || {};
  const views = toNumber(m.views);
  const likes = toNumber(m.likes);
  const comments = toNumber(m.comments);
  const shares = toNumber(m.shares);
  const saves = toNumber(m.saves);
  const clicks = toNumber(m.clicks);
  const impressions = toNumber(m.impressions);
  const reach = toNumber(m.reach);
  const engagementRate =
    toNumber(m.engagementRate) ||
    (views > 0 ? ((likes + comments + shares) / views) * 100 : 0);
  return { impressions, reach, likes, comments, shares, saves, clicks, views, engagementRate };
}

function normalizePost(raw) {
  const rawPlatforms =
    (Array.isArray(raw.platforms) && raw.platforms) ||
    (Array.isArray(raw.platformAnalytics) && raw.platformAnalytics) ||
    [];
  const platforms = rawPlatforms.map((p) => ({
    platform: typeof p.platform === 'string' ? p.platform : '',
    accountId: toId(p.accountId) || toId(p.profileId),
    accountUsername: normalizeUsername(p.accountUsername || p.username || p.displayName),
    platformPostId: p.platformPostId || p.externalPostId || p.postId || undefined,
    platformPostUrl: typeof p.platformPostUrl === 'string' ? p.platformPostUrl : '',
    publishedAt: typeof p.publishedAt === 'string' ? p.publishedAt : '',
    analytics: normalizeMetrics({
      ...(p.analytics || {}),
      impressions: p.analytics?.impressions ?? p.impressions,
      reach: p.analytics?.reach ?? p.reach,
      likes: p.analytics?.likes ?? p.likes,
      comments: p.analytics?.comments ?? p.comments,
      shares: p.analytics?.shares ?? p.shares,
      saves: p.analytics?.saves ?? p.saves,
      clicks: p.analytics?.clicks ?? p.clicks,
      views: p.analytics?.views ?? p.views,
      engagementRate: p.analytics?.engagementRate ?? p.engagementRate,
    }),
  }));

  const firstMedia = Array.isArray(raw.mediaItems) ? raw.mediaItems[0] : undefined;
  const id = raw._id || raw.postId || raw.latePostId || raw.externalPostId || '';

  return {
    _id: id,
    content: raw.content || raw.caption || raw.title || '',
    publishedAt: raw.publishedAt || platforms.find((p) => p.publishedAt)?.publishedAt || '',
    platformPostUrl:
      raw.platformPostUrl || platforms.find((p) => p.platformPostUrl)?.platformPostUrl || '',
    thumbnailUrl:
      raw.thumbnailUrl ||
      raw.thumbnail_url ||
      raw.coverImageUrl ||
      raw.cover_image_url ||
      firstMedia?.thumbnailUrl ||
      firstMedia?.thumbnail_url ||
      firstMedia?.coverImageUrl ||
      firstMedia?.cover_image_url ||
      firstMedia?.url ||
      '',
    platforms,
  };
}

async function fetchAllPosts() {
  const all = [];
  for (const apiKey of API_KEYS) {
    const firstPage = await lateGet(
      `/analytics?limit=${PAGE_SIZE}&page=1&sortBy=date&order=desc`,
      apiKey,
    );
    const firstPosts = extractPosts(firstPage);
    const total = firstPage?.overview?.totalPosts || firstPosts.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    console.log(`[late] key=${apiKey.slice(0, 6)}… totalPosts=${total} pages=${totalPages}`);
    all.push(...firstPosts);
    if (totalPages <= 1) continue;

    const remaining = [];
    for (let p = 2; p <= totalPages; p++) remaining.push(p);
    for (let i = 0; i < remaining.length; i += PARALLEL_PAGES) {
      const batch = remaining.slice(i, i + PARALLEL_PAGES);
      const results = await Promise.allSettled(
        batch.map((page) =>
          lateGet(`/analytics?limit=${PAGE_SIZE}&page=${page}&sortBy=date&order=desc`, apiKey),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...extractPosts(r.value));
        else console.error('  page failed:', r.reason?.message || r.reason);
      }
    }
  }
  return all.map(normalizePost);
}

async function fetchAllFollowerStats() {
  const out = new Map();
  for (const apiKey of API_KEYS) {
    try {
      const data = await lateGet('/accounts/follower-stats', apiKey);
      const items = Array.isArray(data) ? data : data?.accounts || [];
      for (const item of items) {
        const id = item._id || item.accountId || item.id;
        if (!id || out.has(id)) continue;
        out.set(id, item);
      }
    } catch (err) {
      console.error('  follower-stats failed for key', apiKey.slice(0, 6), err.message);
    }
  }
  return out;
}

function pickFollowerCount(stat) {
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

async function main() {
  const startedAt = Date.now();
  console.log(`Late sync starting with ${API_KEYS.length} API key(s)…`);

  const accounts = await sql`SELECT id, platform, username, late_account_id FROM analytics_accounts`;
  const byLateId = new Map();
  const byPlatformUsername = new Map();
  for (const a of accounts) {
    if (a.late_account_id) byLateId.set(a.late_account_id, a);
    if (a.username) byPlatformUsername.set(`${a.platform}:${a.username.toLowerCase()}`, a);
  }
  console.log(`  ${accounts.length} analytics_accounts loaded`);

  const [posts, followerStatsById] = await Promise.all([fetchAllPosts(), fetchAllFollowerStats()]);
  console.log(
    `  ${posts.length} posts fetched from Late, ${followerStatsById.size} follower stats`,
  );

  let mediaItemsUpserted = 0;
  let snapshotsUpserted = 0;
  let unmatched = 0;

  for (const post of posts) {
    for (const pe of post.platforms) {
      let account;
      if (pe.accountId) account = byLateId.get(pe.accountId);
      if (!account && pe.platform && pe.accountUsername) {
        account = byPlatformUsername.get(`${pe.platform}:${pe.accountUsername.toLowerCase()}`);
      }
      if (!account) {
        unmatched++;
        continue;
      }

      const externalId = pe.platformPostId || post._id;
      if (!externalId) continue;

      const m = pe.analytics;
      const publishedAt = pe.publishedAt || post.publishedAt || null;
      const url = pe.platformPostUrl || post.platformPostUrl || null;
      const metadata = {
        source: 'late',
        latePostId: post._id,
        impressions: m.impressions,
        reach: m.reach,
        clicks: m.clicks,
      };

      const upserted = await sql`
        INSERT INTO analytics_media_items
          (account_id, platform, external_id, title, caption, url, thumbnail_url,
           published_at, views, likes, comments, shares, saves, engagement_rate, metadata)
        VALUES
          (${account.id}, ${account.platform}, ${externalId}, ${null}, ${post.content || null},
           ${url}, ${post.thumbnailUrl || null}, ${publishedAt},
           ${m.views}, ${m.likes}, ${m.comments}, ${m.shares}, ${m.saves}, ${m.engagementRate},
           ${JSON.stringify(metadata)}::jsonb)
        ON CONFLICT (account_id, external_id) DO UPDATE SET
          caption = COALESCE(EXCLUDED.caption, analytics_media_items.caption),
          url = COALESCE(EXCLUDED.url, analytics_media_items.url),
          thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, analytics_media_items.thumbnail_url),
          views = EXCLUDED.views,
          likes = EXCLUDED.likes,
          comments = EXCLUDED.comments,
          shares = EXCLUDED.shares,
          saves = EXCLUDED.saves,
          engagement_rate = EXCLUDED.engagement_rate,
          metadata = COALESCE(EXCLUDED.metadata, analytics_media_items.metadata)
        RETURNING id
      `;
      mediaItemsUpserted++;
      const mediaId = upserted[0]?.id;
      if (!mediaId) continue;

      await sql`
        INSERT INTO analytics_media_snapshots
          (media_item_id, views, likes, comments, shares, engagement_rate, snapshot_date)
        VALUES
          (${mediaId}, ${m.views}, ${m.likes}, ${m.comments}, ${m.shares}, ${m.engagementRate},
           (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE)
        ON CONFLICT (media_item_id, snapshot_date) DO UPDATE SET
          views = EXCLUDED.views,
          likes = EXCLUDED.likes,
          comments = EXCLUDED.comments,
          shares = EXCLUDED.shares,
          engagement_rate = EXCLUDED.engagement_rate
      `;
      snapshotsUpserted++;
    }
  }

  console.log(
    `  media_items upserted: ${mediaItemsUpserted}, snapshots: ${snapshotsUpserted}, unmatched: ${unmatched}`,
  );

  // Refresh every account we know about.
  let accountsRefreshed = 0;
  let followersRefreshed = 0;
  for (const account of accounts) {
    try {
      const totalsRows = await sql`
        SELECT
          COALESCE(SUM(views), 0)::bigint     AS total_views,
          COALESCE(SUM(likes), 0)::bigint     AS total_likes,
          COALESCE(SUM(comments), 0)::bigint  AS total_comments,
          COALESCE(SUM(shares), 0)::bigint    AS total_shares
        FROM analytics_media_items
        WHERE account_id = ${account.id}
      `;
      const t = totalsRows[0] || {};
      const totalViews = Number(t.total_views) || 0;
      const totalLikes = Number(t.total_likes) || 0;
      const totalComments = Number(t.total_comments) || 0;
      const totalShares = Number(t.total_shares) || 0;
      const interactions = totalLikes + totalComments + totalShares;
      const engagementRate = totalViews > 0 ? (interactions / totalViews) * 100 : 0;

      const stat = account.late_account_id ? followerStatsById.get(account.late_account_id) : null;
      const followers = stat ? pickFollowerCount(stat) : 0;
      if (followers > 0) followersRefreshed++;

      await sql`
        UPDATE analytics_accounts SET
          total_views = ${totalViews},
          total_likes = ${totalLikes},
          total_comments = ${totalComments},
          total_shares = ${totalShares},
          engagement_rate = ${engagementRate},
          followers = COALESCE(${followers > 0 ? followers : null}, followers),
          last_synced_at = NOW()
        WHERE id = ${account.id}
      `;

      await sql`
        INSERT INTO analytics_account_snapshots
          (account_id, followers, total_views, total_likes, total_comments, total_shares,
           engagement_rate, snapshot_date)
        VALUES
          (${account.id}, ${followers}, ${totalViews}, ${totalLikes}, ${totalComments},
           ${totalShares}, ${engagementRate}, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE)
        ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
          followers = GREATEST(EXCLUDED.followers, analytics_account_snapshots.followers),
          total_views = EXCLUDED.total_views,
          total_likes = EXCLUDED.total_likes,
          total_comments = EXCLUDED.total_comments,
          total_shares = EXCLUDED.total_shares,
          engagement_rate = EXCLUDED.engagement_rate
      `;
      accountsRefreshed++;
    } catch (err) {
      console.error(`  account refresh failed for ${account.id}:`, err.message);
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\nDONE in ${durationSec}s | postsFetched=${posts.length} | mediaUpserts=${mediaItemsUpserted} | snapshots=${snapshotsUpserted} | accountsRefreshed=${accountsRefreshed} | followersRefreshed=${followersRefreshed} | unmatched=${unmatched}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
