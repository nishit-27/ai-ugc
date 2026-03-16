import { sql as rawSql } from './db-client';
import { db } from './drizzle';
import { analyticsAccounts } from './schema';
import { eq } from 'drizzle-orm';

// ── Analytics Accounts ──

export async function createAnalyticsAccount({ platform, username, accountId, displayName, profileUrl, lateAccountId, followers, totalViews, totalLikes, totalComments, totalShares, engagementRate, metadata }) {
  const rows = await rawSql`
    INSERT INTO analytics_accounts (platform, username, account_id, display_name, profile_url, late_account_id, followers, total_views, total_likes, total_comments, total_shares, engagement_rate, metadata, last_synced_at)
    VALUES (${platform}, ${username}, ${accountId || null}, ${displayName || null}, ${profileUrl || null}, ${lateAccountId || null}, ${followers || 0}, ${totalViews || 0}, ${totalLikes || 0}, ${totalComments || 0}, ${totalShares || 0}, ${engagementRate || 0}, ${metadata ? JSON.stringify(metadata) : null}, NOW())
    ON CONFLICT (platform, username) DO UPDATE SET
      account_id = COALESCE(EXCLUDED.account_id, analytics_accounts.account_id),
      display_name = COALESCE(EXCLUDED.display_name, analytics_accounts.display_name),
      profile_url = COALESCE(EXCLUDED.profile_url, analytics_accounts.profile_url),
      late_account_id = COALESCE(EXCLUDED.late_account_id, analytics_accounts.late_account_id),
      followers = EXCLUDED.followers,
      total_views = EXCLUDED.total_views,
      total_likes = EXCLUDED.total_likes,
      total_comments = EXCLUDED.total_comments,
      total_shares = EXCLUDED.total_shares,
      engagement_rate = EXCLUDED.engagement_rate,
      metadata = COALESCE(EXCLUDED.metadata, analytics_accounts.metadata),
      last_synced_at = NOW()
    RETURNING *
  `;
  return rows[0];
}

export async function getAnalyticsAccount(id) {
  const rows = await db.select().from(analyticsAccounts).where(eq(analyticsAccounts.id, id));
  return rows[0] || null;
}

export async function getAllAnalyticsAccounts() {
  return rawSql`
    SELECT aa.*,
      (SELECT COUNT(*) FROM analytics_media_items WHERE account_id = aa.id) AS media_count
    FROM analytics_accounts aa
    ORDER BY aa.created_at DESC
  `;
}

export async function updateAnalyticsAccount(id, updates) {
  const { followers, totalViews, totalLikes, totalComments, totalShares, engagementRate, accountId, displayName, profileUrl, lateAccountId, metadata } = updates;
  const rows = await rawSql`
    UPDATE analytics_accounts SET
      followers = COALESCE(${followers ?? null}, followers),
      total_views = COALESCE(${totalViews ?? null}, total_views),
      total_likes = COALESCE(${totalLikes ?? null}, total_likes),
      total_comments = COALESCE(${totalComments ?? null}, total_comments),
      total_shares = COALESCE(${totalShares ?? null}, total_shares),
      engagement_rate = COALESCE(${engagementRate ?? null}, engagement_rate),
      account_id = COALESCE(${accountId ?? null}, account_id),
      display_name = COALESCE(${displayName ?? null}, display_name),
      profile_url = COALESCE(${profileUrl ?? null}, profile_url),
      late_account_id = COALESCE(${lateAccountId ?? null}, late_account_id),
      metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}, metadata),
      last_synced_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteAnalyticsAccount(id) {
  await db.delete(analyticsAccounts).where(eq(analyticsAccounts.id, id));
}

export async function touchAllAccountsSyncTime() {
  await rawSql`UPDATE analytics_accounts SET last_synced_at = NOW()`;
}

// ── Latest post date per account (for skip-stale logic) ──

export async function getLatestPostDate(accountId) {
  const rows = await rawSql`
    SELECT MAX(published_at) AS latest
    FROM analytics_media_items
    WHERE account_id = ${accountId} AND published_at IS NOT NULL
  `;
  return rows[0]?.latest ? new Date(rows[0].latest) : null;
}

// ── Account Snapshots ──

export async function upsertAccountSnapshot(accountId, data) {
  const { followers, totalViews, totalLikes, totalComments, totalShares, engagementRate } = data;
  const rows = await rawSql`
    INSERT INTO analytics_account_snapshots (account_id, followers, total_views, total_likes, total_comments, total_shares, engagement_rate, snapshot_date)
    VALUES (${accountId}, ${followers || 0}, ${totalViews || 0}, ${totalLikes || 0}, ${totalComments || 0}, ${totalShares || 0}, ${engagementRate || 0}, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE)
    ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
      followers = EXCLUDED.followers,
      total_views = EXCLUDED.total_views,
      total_likes = EXCLUDED.total_likes,
      total_comments = EXCLUDED.total_comments,
      total_shares = EXCLUDED.total_shares,
      engagement_rate = EXCLUDED.engagement_rate
    RETURNING *
  `;
  return rows[0];
}

export async function getAccountSnapshots(accountId, days = 30) {
  return rawSql`
    SELECT * FROM analytics_account_snapshots
    WHERE account_id = ${accountId}
      AND snapshot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${days}::INTEGER
    ORDER BY snapshot_date ASC
  `;
}

export async function getAllAccountSnapshots(days = 30) {
  return rawSql`
    SELECT s.*, a.platform, a.username
    FROM analytics_account_snapshots s
    JOIN analytics_accounts a ON a.id = s.account_id
    WHERE s.snapshot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${days}::INTEGER
    ORDER BY s.snapshot_date ASC
  `;
}

// ── Media Items ──

export async function upsertMediaItem({ accountId, platform, externalId, title, caption, url, thumbnailUrl, publishedAt, views, likes, comments, shares, saves, engagementRate, metadata }) {
  const rows = await rawSql`
    INSERT INTO analytics_media_items (account_id, platform, external_id, title, caption, url, thumbnail_url, published_at, views, likes, comments, shares, saves, engagement_rate, metadata)
    VALUES (${accountId}, ${platform}, ${externalId}, ${title || null}, ${caption || null}, ${url || null}, ${thumbnailUrl || null}, ${publishedAt || null}, ${views || 0}, ${likes || 0}, ${comments || 0}, ${shares || 0}, ${saves || 0}, ${engagementRate || 0}, ${metadata ? JSON.stringify(metadata) : null})
    ON CONFLICT (account_id, external_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, analytics_media_items.title),
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
    RETURNING *
  `;
  return rows[0];
}

export async function getMediaExternalIds(accountId) {
  const rows = await rawSql`
    SELECT external_id FROM analytics_media_items
    WHERE account_id = ${accountId}
  `;
  return new Set(rows.map(r => r.external_id));
}

export async function getMediaItemsByAccount(accountId, limit = 50) {
  return rawSql`
    SELECT * FROM analytics_media_items
    WHERE account_id = ${accountId}
    ORDER BY views DESC
    LIMIT ${limit}
  `;
}

export async function getAllMediaItems({ platform = undefined, accountId = undefined, sortBy = 'views', order = 'desc', limit = 50, offset = 0 } = {}) {
  // Build dynamic query with filters
  if (platform && accountId) {
    if (sortBy === 'likes') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform} AND m.account_id = ${accountId}
        ORDER BY m.likes DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'comments') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform} AND m.account_id = ${accountId}
        ORDER BY m.comments DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'date') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform} AND m.account_id = ${accountId}
        ORDER BY m.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      WHERE m.platform = ${platform} AND m.account_id = ${accountId}
      ORDER BY m.views DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (platform) {
    if (sortBy === 'likes') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform}
        ORDER BY m.likes DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'comments') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform}
        ORDER BY m.comments DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'date') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.platform = ${platform}
        ORDER BY m.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      WHERE m.platform = ${platform}
      ORDER BY m.views DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (accountId) {
    if (sortBy === 'likes') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.account_id = ${accountId}
        ORDER BY m.likes DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'comments') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.account_id = ${accountId}
        ORDER BY m.comments DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (sortBy === 'date') {
      return rawSql`
        SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
        FROM analytics_media_items m
        JOIN analytics_accounts a ON a.id = m.account_id
        WHERE m.account_id = ${accountId}
        ORDER BY m.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      WHERE m.account_id = ${accountId}
      ORDER BY m.views DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // No filters
  if (sortBy === 'likes') {
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      ORDER BY m.likes DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sortBy === 'comments') {
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      ORDER BY m.comments DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sortBy === 'date') {
    return rawSql`
      SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
      FROM analytics_media_items m
      JOIN analytics_accounts a ON a.id = m.account_id
      ORDER BY m.published_at DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return rawSql`
    SELECT m.*, a.username AS account_username, a.display_name AS account_display_name
    FROM analytics_media_items m
    JOIN analytics_accounts a ON a.id = m.account_id
    ORDER BY m.views DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

// ── Media Snapshots ──

export async function upsertMediaSnapshot(mediaItemId, data) {
  const { views, likes, comments, shares, engagementRate } = data;
  const rows = await rawSql`
    INSERT INTO analytics_media_snapshots (media_item_id, views, likes, comments, shares, engagement_rate, snapshot_date)
    VALUES (${mediaItemId}, ${views || 0}, ${likes || 0}, ${comments || 0}, ${shares || 0}, ${engagementRate || 0}, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE)
    ON CONFLICT (media_item_id, snapshot_date) DO UPDATE SET
      views = EXCLUDED.views,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      shares = EXCLUDED.shares,
      engagement_rate = EXCLUDED.engagement_rate
    RETURNING *
  `;
  return rows[0];
}

// ── Link media items to template jobs ──

export async function linkMediaItemToJob(mediaItemId, externalId, accountId) {
  // Find matching post via external_post_id → job_id
  const postRows = await rawSql`
    SELECT p.job_id FROM posts p
    WHERE p.external_post_id = ${externalId}
      AND p.late_account_id IN (SELECT late_account_id FROM analytics_accounts WHERE id = ${accountId})
    LIMIT 1
  `;
  if (!postRows[0]?.job_id) return null;

  const jobId = postRows[0].job_id;

  // Set template_job_id on the media item
  await rawSql`UPDATE analytics_media_items SET template_job_id = ${jobId} WHERE id = ${mediaItemId}`;

  // Copy variable values from job to media item
  await rawSql`
    INSERT INTO media_variable_values (media_item_id, variable_id, value)
    SELECT ${mediaItemId}, variable_id, value
    FROM job_variable_values WHERE template_job_id = ${jobId}
    ON CONFLICT (media_item_id, variable_id) DO NOTHING
  `;

  return jobId;
}

export async function linkMediaItemsByExternalPostId(externalPostId, jobId) {
  // Find unlinked media items matching this external post ID
  const mediaRows = await rawSql`
    SELECT id FROM analytics_media_items
    WHERE external_id = ${externalPostId} AND template_job_id IS NULL
  `;
  for (const media of mediaRows) {
    await rawSql`UPDATE analytics_media_items SET template_job_id = ${jobId} WHERE id = ${media.id}`;
    await rawSql`
      INSERT INTO media_variable_values (media_item_id, variable_id, value)
      SELECT ${media.id}, variable_id, value
      FROM job_variable_values WHERE template_job_id = ${jobId}
      ON CONFLICT (media_item_id, variable_id) DO NOTHING
    `;
  }
  return mediaRows.length;
}

// ── Unlinked media items (for backfill) ──

export async function getUnlinkedMediaItems() {
  return rawSql`
    SELECT ami.id AS media_item_id, ami.external_id, p.job_id
    FROM analytics_media_items ami
    JOIN analytics_accounts aa ON aa.id = ami.account_id
    JOIN posts p ON p.external_post_id = ami.external_id
      AND p.late_account_id = aa.late_account_id
    WHERE ami.template_job_id IS NULL
      AND p.job_id IS NOT NULL
  `;
}

export async function setMediaItemJobId(mediaItemId, jobId) {
  await rawSql`UPDATE analytics_media_items SET template_job_id = ${jobId} WHERE id = ${mediaItemId}`;
}

export async function getLinkedMediaItemsByJobId(jobId) {
  return rawSql`SELECT id FROM analytics_media_items WHERE template_job_id = ${jobId}`;
}

// ── Posting time heatmap ──

export async function getPostingTimesBucket(days) {
  const condition = days > 0
    ? rawSql`AND published_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${days}::INTEGER`
    : rawSql``;

  const rows = await rawSql`
    SELECT
      EXTRACT(DOW FROM published_at AT TIME ZONE 'Asia/Kolkata')::INT AS day_of_week,
      EXTRACT(HOUR FROM published_at AT TIME ZONE 'Asia/Kolkata')::INT AS hour,
      COUNT(*)::INT AS posts,
      COALESCE(SUM(views), 0)::BIGINT AS total_views,
      COALESCE(SUM(likes + comments + shares), 0)::BIGINT AS total_engagement
    FROM analytics_media_items
    WHERE published_at IS NOT NULL ${condition}
    GROUP BY day_of_week, hour
    ORDER BY day_of_week, hour
  `;

  return rows.map(r => ({
    dayOfWeek: Number(r.day_of_week),
    hour: Number(r.hour),
    posts: Number(r.posts),
    totalViews: Number(r.total_views),
    totalEngagement: Number(r.total_engagement),
  }));
}

// ── Account Media Totals (computed from all stored media items) ──

export async function getAccountMediaTotals(accountId) {
  const rows = await rawSql`
    SELECT
      COALESCE(SUM(views), 0)::BIGINT AS total_views,
      COALESCE(SUM(likes), 0)::BIGINT AS total_likes,
      COALESCE(SUM(comments), 0)::BIGINT AS total_comments,
      COALESCE(SUM(shares), 0)::BIGINT AS total_shares,
      COALESCE(SUM(saves), 0)::BIGINT AS total_saves
    FROM analytics_media_items
    WHERE account_id = ${accountId}
  `;
  const r = rows[0] || {};
  return {
    totalViews: Number(r.total_views) || 0,
    totalLikes: Number(r.total_likes) || 0,
    totalComments: Number(r.total_comments) || 0,
    totalShares: Number(r.total_shares) || 0,
    totalSaves: Number(r.total_saves) || 0,
  };
}

// ── Posting Activity (computed from ALL media items) ──

export async function getPostingActivity(daysBack = 0, unique = false) {
  const hasFilter = daysBack > 0;

  if (unique) {
    // Unique mode: count posted jobs from template_jobs (each job = one unique video)
    const rows = hasFilter
      ? await rawSql`
          SELECT
            TO_CHAR((completed_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
            COUNT(*)::INTEGER AS posts,
            0::BIGINT AS total_views
          FROM template_jobs
          WHERE status = 'completed' AND post_status = 'posted'
            AND completed_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
          GROUP BY (completed_at AT TIME ZONE 'Asia/Kolkata')::DATE
          ORDER BY (completed_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
        `
      : await rawSql`
          SELECT
            TO_CHAR((completed_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
            COUNT(*)::INTEGER AS posts,
            0::BIGINT AS total_views
          FROM template_jobs
          WHERE status = 'completed' AND post_status = 'posted'
          GROUP BY (completed_at AT TIME ZONE 'Asia/Kolkata')::DATE
          ORDER BY (completed_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
        `;

    const totalCount = hasFilter
      ? await rawSql`
          SELECT COUNT(*)::INTEGER AS total FROM template_jobs
          WHERE status = 'completed' AND post_status = 'posted'
            AND completed_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
        `
      : await rawSql`
          SELECT COUNT(*)::INTEGER AS total FROM template_jobs
          WHERE status = 'completed' AND post_status = 'posted'
        `;

    const data = rows.map(r => ({
      date: String(r.date).trim(),
      posts: Number(r.posts),
      totalViews: Number(r.total_views),
    }));
    return { postingActivity: data, totalVideos: Number(totalCount[0]?.total) || 0 };
  }

  // Default mode: count total posts = each posted job × number of accounts for that model
  const rows = hasFilter
    ? await rawSql`
        SELECT
          TO_CHAR((j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
          SUM(COALESCE(m.acct_count, 0))::INTEGER AS posts,
          0::BIGINT AS total_views
        FROM template_jobs j
        LEFT JOIN (
          SELECT model_id, COUNT(*)::INTEGER AS acct_count
          FROM model_account_mappings
          GROUP BY model_id
        ) m ON m.model_id = j.model_id
        WHERE j.status = 'completed' AND j.post_status = 'posted'
          AND j.completed_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
        GROUP BY (j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE
        ORDER BY (j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
      `
    : await rawSql`
        SELECT
          TO_CHAR((j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
          SUM(COALESCE(m.acct_count, 0))::INTEGER AS posts,
          0::BIGINT AS total_views
        FROM template_jobs j
        LEFT JOIN (
          SELECT model_id, COUNT(*)::INTEGER AS acct_count
          FROM model_account_mappings
          GROUP BY model_id
        ) m ON m.model_id = j.model_id
        WHERE j.status = 'completed' AND j.post_status = 'posted'
        GROUP BY (j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE
        ORDER BY (j.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
      `;

  // Total count matches the selected time filter
  const totalCount = hasFilter
    ? await rawSql`
        SELECT SUM(COALESCE(m.acct_count, 0))::INTEGER AS total
        FROM template_jobs j
        LEFT JOIN (
          SELECT model_id, COUNT(*)::INTEGER AS acct_count
          FROM model_account_mappings
          GROUP BY model_id
        ) m ON m.model_id = j.model_id
        WHERE j.status = 'completed' AND j.post_status = 'posted'
          AND j.completed_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
      `
    : await rawSql`
        SELECT SUM(COALESCE(m.acct_count, 0))::INTEGER AS total
        FROM template_jobs j
        LEFT JOIN (
          SELECT model_id, COUNT(*)::INTEGER AS acct_count
          FROM model_account_mappings
          GROUP BY model_id
        ) m ON m.model_id = j.model_id
        WHERE j.status = 'completed' AND j.post_status = 'posted'
      `;

  const data = rows.map(r => ({
    date: String(r.date).trim(),
    posts: Number(r.posts),
    totalViews: Number(r.total_views),
  }));
  return { postingActivity: data, totalVideos: Number(totalCount[0]?.total) || 0 };
}

// ── Daily Media Metrics (per-day breakdown from all media items) ──

export async function getDailyMediaMetrics(daysBack = 0) {
  const hasFilter = daysBack > 0;
  const rows = hasFilter
    ? await rawSql`
        SELECT
          TO_CHAR((published_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
          COUNT(*)::INTEGER AS posts,
          COALESCE(SUM(views), 0)::BIGINT AS total_views,
          COALESCE(SUM(likes), 0)::BIGINT AS total_likes,
          COALESCE(SUM(comments), 0)::BIGINT AS total_comments,
          COALESCE(SUM(shares), 0)::BIGINT AS total_shares
        FROM analytics_media_items
        WHERE published_at IS NOT NULL
          AND published_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
        GROUP BY (published_at AT TIME ZONE 'Asia/Kolkata')::DATE
        ORDER BY (published_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
      `
    : await rawSql`
        SELECT
          TO_CHAR((published_at AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYY-MM-DD') AS date,
          COUNT(*)::INTEGER AS posts,
          COALESCE(SUM(views), 0)::BIGINT AS total_views,
          COALESCE(SUM(likes), 0)::BIGINT AS total_likes,
          COALESCE(SUM(comments), 0)::BIGINT AS total_comments,
          COALESCE(SUM(shares), 0)::BIGINT AS total_shares
        FROM analytics_media_items
        WHERE published_at IS NOT NULL
        GROUP BY (published_at AT TIME ZONE 'Asia/Kolkata')::DATE
        ORDER BY (published_at AT TIME ZONE 'Asia/Kolkata')::DATE ASC
      `;

  return rows.map(r => ({
    date: String(r.date).trim(),
    posts: Number(r.posts),
    views: Number(r.total_views),
    likes: Number(r.total_likes),
    comments: Number(r.total_comments),
    shares: Number(r.total_shares),
  }));
}

// ── Follower History (date-filtered from account snapshots) ──

export async function getFollowerHistory(daysBack = 0) {
  // Use LATERAL join to carry forward each account's latest known follower count
  // for each date. This prevents the SUM from dropping when some accounts
  // don't have snapshots on a given date.
  const hasFilter = daysBack > 0;
  return hasFilter
    ? rawSql`
        SELECT
          TO_CHAR(d.snapshot_date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(latest.followers), 0)::BIGINT AS followers
        FROM (
          SELECT DISTINCT snapshot_date FROM analytics_account_snapshots
          WHERE snapshot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
        ) d
        CROSS JOIN analytics_accounts a
        LEFT JOIN LATERAL (
          SELECT followers FROM analytics_account_snapshots s
          WHERE s.account_id = a.id AND s.snapshot_date <= d.snapshot_date
          ORDER BY s.snapshot_date DESC
          LIMIT 1
        ) latest ON true
        GROUP BY d.snapshot_date
        ORDER BY d.snapshot_date ASC
      `
    : rawSql`
        SELECT
          TO_CHAR(d.snapshot_date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(latest.followers), 0)::BIGINT AS followers
        FROM (
          SELECT DISTINCT snapshot_date FROM analytics_account_snapshots
        ) d
        CROSS JOIN analytics_accounts a
        LEFT JOIN LATERAL (
          SELECT followers FROM analytics_account_snapshots s
          WHERE s.account_id = a.id AND s.snapshot_date <= d.snapshot_date
          ORDER BY s.snapshot_date DESC
          LIMIT 1
        ) latest ON true
        GROUP BY d.snapshot_date
        ORDER BY d.snapshot_date ASC
      `;
}

// ── Platform Breakdown (date-filtered from media items) ──

export async function getPlatformBreakdown(daysBack = 0) {
  const hasFilter = daysBack > 0;
  const rows = hasFilter
    ? await rawSql`
        SELECT
          m.platform,
          COALESCE(SUM(m.views), 0)::BIGINT AS total_views,
          COALESCE(SUM(m.likes), 0)::BIGINT AS total_likes,
          COALESCE(SUM(m.comments), 0)::BIGINT AS total_comments,
          COALESCE(SUM(m.shares), 0)::BIGINT AS total_shares,
          COUNT(*)::INTEGER AS video_count
        FROM analytics_media_items m
        WHERE m.published_at IS NOT NULL
          AND m.published_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${daysBack}::INTEGER
        GROUP BY m.platform
        ORDER BY total_views DESC
      `
    : await rawSql`
        SELECT
          m.platform,
          COALESCE(SUM(m.views), 0)::BIGINT AS total_views,
          COALESCE(SUM(m.likes), 0)::BIGINT AS total_likes,
          COALESCE(SUM(m.comments), 0)::BIGINT AS total_comments,
          COALESCE(SUM(m.shares), 0)::BIGINT AS total_shares,
          COUNT(*)::INTEGER AS video_count
        FROM analytics_media_items m
        WHERE m.published_at IS NOT NULL
        GROUP BY m.platform
        ORDER BY total_views DESC
      `;

  // Also get current follower counts per platform (not date-filtered)
  const followerRows = await rawSql`
    SELECT platform, COALESCE(SUM(followers), 0)::BIGINT AS followers
    FROM analytics_accounts
    GROUP BY platform
  `;
  const followerMap = Object.fromEntries(followerRows.map(r => [r.platform, Number(r.followers)]));

  return rows.map(r => ({
    platform: r.platform,
    views: Number(r.total_views),
    likes: Number(r.total_likes),
    comments: Number(r.total_comments),
    shares: Number(r.total_shares),
    videoCount: Number(r.video_count),
    followers: followerMap[r.platform] || 0,
  }));
}

// ── Overview aggregation ──

export async function getAnalyticsOverview(days = 30) {
  const accounts = await rawSql`SELECT * FROM analytics_accounts ORDER BY created_at DESC`;
  const snapshots = await rawSql`
    SELECT s.snapshot_date,
      SUM(s.followers)::INTEGER AS followers,
      SUM(s.total_views)::BIGINT AS total_views,
      SUM(s.total_likes)::BIGINT AS total_likes,
      SUM(s.total_comments)::BIGINT AS total_comments,
      SUM(s.total_shares)::BIGINT AS total_shares,
      AVG(s.engagement_rate) AS engagement_rate
    FROM analytics_account_snapshots s
    JOIN analytics_accounts a ON a.id = s.account_id
    WHERE s.snapshot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${days}::INTEGER
    GROUP BY s.snapshot_date
    ORDER BY s.snapshot_date ASC
  `;

  let totalFollowers = 0, totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0, engagementSum = 0;
  const platformMap = {};

  for (const a of accounts) {
    totalFollowers += Number(a.followers) || 0;
    totalViews += Number(a.total_views) || 0;
    totalLikes += Number(a.total_likes) || 0;
    totalComments += Number(a.total_comments) || 0;
    totalShares += Number(a.total_shares) || 0;
    engagementSum += Number(a.engagement_rate) || 0;

    if (!platformMap[a.platform]) {
      platformMap[a.platform] = { platform: a.platform, followers: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, accountCount: 0 };
    }
    const p = platformMap[a.platform];
    p.followers += Number(a.followers) || 0;
    p.views += Number(a.total_views) || 0;
    p.likes += Number(a.total_likes) || 0;
    p.comments += Number(a.total_comments) || 0;
    p.shares += Number(a.total_shares) || 0;
    p.engagementRate += Number(a.engagement_rate) || 0;
    p.accountCount += 1;
  }

  // Average engagement per platform
  for (const p of Object.values(platformMap)) {
    if (p.accountCount > 0) p.engagementRate = p.engagementRate / p.accountCount;
  }

  const { postingActivity, totalVideos } = await getPostingActivity();

  // Get the actual latest post by published_at (not limited by top-N views)
  const latestRows = await rawSql`
    SELECT m.title, m.caption, m.url, m.published_at, m.platform,
           a.username AS account_username
    FROM analytics_media_items m
    JOIN analytics_accounts a ON a.id = m.account_id
    WHERE m.published_at IS NOT NULL
    ORDER BY m.published_at DESC
    LIMIT 1
  `;
  const lp = latestRows[0] || null;
  const latestPost = lp ? {
    title: lp.title || null,
    caption: lp.caption || null,
    url: lp.url || null,
    publishedAt: lp.published_at,
    platform: lp.platform,
    accountUsername: lp.account_username,
  } : null;

  // Get the most recent sync timestamp across all accounts (ensure UTC)
  const lastSyncedAt = accounts.reduce((latest, a) => {
    if (!a.last_synced_at) return latest;
    const str = String(a.last_synced_at);
    const t = new Date(str.endsWith('Z') ? str : str + 'Z').getTime();
    return t > latest ? t : latest;
  }, 0);

  return {
    totalFollowers,
    totalViews,
    totalInteractions: totalLikes + totalComments + totalShares,
    avgEngagementRate: accounts.length > 0 ? engagementSum / accounts.length : 0,
    accountCount: accounts.length,
    platformBreakdown: Object.values(platformMap),
    postingActivity,
    totalVideos,
    latestPost,
    lastSyncedAt: lastSyncedAt > 0 ? new Date(lastSyncedAt).toISOString() : null,
    history: snapshots.map(s => ({
      date: s.snapshot_date,
      followers: Number(s.followers),
      totalViews: Number(s.total_views),
      totalLikes: Number(s.total_likes),
      totalComments: Number(s.total_comments),
      totalShares: Number(s.total_shares),
      engagementRate: Number(s.engagement_rate),
    })),
  };
}
