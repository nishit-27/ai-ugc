import { sql as rawSql } from './db-client';
import { db } from './drizzle';
import { posts, postIdempotencyKeys, postRequestLocks } from './schema';
import { eq, desc, inArray } from 'drizzle-orm';

// Helper to convert raw sql rows (snake_case) to camelCase post shape
function toPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    accountId: row.account_id,
    lateAccountId: row.late_account_id,
    caption: row.caption,
    videoUrl: row.video_url,
    platform: row.platform,
    status: row.status,
    scheduledFor: row.scheduled_for?.toISOString?.() || row.scheduled_for,
    publishedAt: row.published_at?.toISOString?.() || row.published_at,
    externalPostId: row.external_post_id,
    latePostId: row.late_post_id,
    platformPostUrl: row.platform_post_url,
    publishAttempts: row.publish_attempts,
    lastCheckedAt: row.last_checked_at?.toISOString?.() || row.last_checked_at,
    error: row.error,
    apiKeyIndex: row.api_key_index ?? 0,
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

// Helper to convert Drizzle row (camelCase) to the expected post shape
function drizzleToPost(row) {
  return {
    id: row.id,
    jobId: row.jobId,
    accountId: row.accountId,
    lateAccountId: row.lateAccountId,
    caption: row.caption,
    videoUrl: row.videoUrl,
    platform: row.platform,
    status: row.status,
    scheduledFor: row.scheduledFor?.toISOString?.() || row.scheduledFor,
    publishedAt: row.publishedAt?.toISOString?.() || row.publishedAt,
    externalPostId: row.externalPostId,
    latePostId: row.latePostId,
    platformPostUrl: row.platformPostUrl,
    publishAttempts: row.publishAttempts,
    lastCheckedAt: row.lastCheckedAt?.toISOString?.() || row.lastCheckedAt,
    error: row.error,
    apiKeyIndex: row.apiKeyIndex ?? 0,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  };
}

export async function createPost({ jobId, accountId, lateAccountId, caption, videoUrl, platform, status, scheduledFor, latePostId, platformPostUrl, createdBy, apiKeyIndex = 0 }) {
  const result = await rawSql`
    INSERT INTO posts (job_id, account_id, late_account_id, caption, video_url, platform, status, scheduled_for, late_post_id, platform_post_url, created_by, api_key_index)
    VALUES (${jobId || null}, ${accountId || null}, ${lateAccountId || null}, ${caption || null}, ${videoUrl || null}, ${platform || 'tiktok'}, ${status || 'draft'}, ${scheduledFor || null}, ${latePostId || null}, ${platformPostUrl || null}, ${createdBy || null}, ${apiKeyIndex})
    ON CONFLICT (job_id, late_account_id, platform)
    DO UPDATE SET
      caption = EXCLUDED.caption,
      video_url = EXCLUDED.video_url,
      status = EXCLUDED.status,
      scheduled_for = EXCLUDED.scheduled_for,
      late_post_id = COALESCE(EXCLUDED.late_post_id, posts.late_post_id),
      platform_post_url = COALESCE(EXCLUDED.platform_post_url, posts.platform_post_url),
      created_by = COALESCE(posts.created_by, EXCLUDED.created_by),
      api_key_index = EXCLUDED.api_key_index,
      updated_at = NOW()
    RETURNING *
  `;
  return toPost(result[0]);
}

export async function getPost(id) {
  const result = await db.select().from(posts).where(eq(posts.id, id));
  return result[0] ? drizzleToPost(result[0]) : null;
}

export async function getAllPosts() {
  const result = await db.select().from(posts).orderBy(desc(posts.createdAt));
  return result.map(drizzleToPost);
}

export async function getPostsByJobIds(jobIds) {
  if (!jobIds || jobIds.length === 0) return [];
  const result = await db.select().from(posts).where(inArray(posts.jobId, jobIds)).orderBy(desc(posts.createdAt));
  return result.map(drizzleToPost);
}

export async function updatePost(id, updates) {
  const { status, publishedAt, externalPostId, error, latePostId, platformPostUrl, publishAttempts, lastCheckedAt } = updates;

  const result = await rawSql`
    UPDATE posts SET
      status = COALESCE(${status || null}, status),
      published_at = COALESCE(${publishedAt || null}, published_at),
      external_post_id = COALESCE(${externalPostId || null}, external_post_id),
      error = ${error !== undefined ? error : null},
      late_post_id = COALESCE(${latePostId || null}, late_post_id),
      platform_post_url = COALESCE(${platformPostUrl || null}, platform_post_url),
      publish_attempts = COALESCE(${publishAttempts ?? null}, publish_attempts),
      last_checked_at = COALESCE(${lastCheckedAt || null}, last_checked_at),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? toPost(result[0]) : null;
}

export async function getPostByLateId(latePostId) {
  const result = await db.select().from(posts).where(eq(posts.latePostId, latePostId));
  return result[0] ? drizzleToPost(result[0]) : null;
}

export async function getPostApiKeyIndex(latePostId) {
  const result = await db.select({ apiKeyIndex: posts.apiKeyIndex }).from(posts).where(eq(posts.latePostId, latePostId)).limit(1);
  return result[0]?.apiKeyIndex ?? null;
}

export async function updatePostByLateId(latePostId, updates) {
  const { status, publishedAt, externalPostId, error, platformPostUrl, publishAttempts, lastCheckedAt } = updates;

  const result = await rawSql`
    UPDATE posts SET
      status = COALESCE(${status || null}, status),
      published_at = COALESCE(${publishedAt || null}, published_at),
      external_post_id = COALESCE(${externalPostId || null}, external_post_id),
      error = ${error !== undefined ? error : null},
      platform_post_url = COALESCE(${platformPostUrl || null}, platform_post_url),
      publish_attempts = COALESCE(${publishAttempts ?? null}, publish_attempts),
      last_checked_at = COALESCE(${lastCheckedAt || null}, last_checked_at),
      updated_at = NOW()
    WHERE late_post_id = ${latePostId}
    RETURNING *
  `;
  return result[0] ? toPost(result[0]) : null;
}

export async function getPendingPosts() {
  const result = await db.select().from(posts)
    .where(inArray(posts.status, ['pending', 'publishing', 'scheduled']))
    .orderBy(desc(posts.createdAt));
  // Filter for late_post_id IS NOT NULL in JS since Drizzle doesn't have isNotNull in inArray combo easily
  const filtered = result.filter(r => r.latePostId != null);
  return filtered.map(drizzleToPost);
}

export async function acquirePostRequestLock(lockKey, staleMinutes = 15) {
  if (!lockKey) return false;

  await rawSql`
    DELETE FROM post_request_locks
    WHERE locked_at < NOW() - (${staleMinutes} * INTERVAL '1 minute')
  `;

  const result = await rawSql`
    INSERT INTO post_request_locks (lock_key, locked_at)
    VALUES (${lockKey}, NOW())
    ON CONFLICT (lock_key) DO NOTHING
    RETURNING lock_key
  `;

  return !!result[0];
}

export async function releasePostRequestLock(lockKey) {
  if (!lockKey) return;
  await db.delete(postRequestLocks).where(eq(postRequestLocks.lockKey, lockKey));
}

/**
 * @param {{ key: string; requestHash: string; staleMinutes?: number }} params
 */
export async function beginPostIdempotency({ key, requestHash, staleMinutes = 30 }) {
  if (!key || !requestHash) {
    throw new Error('Both key and requestHash are required for idempotency');
  }

  await rawSql`
    DELETE FROM post_idempotency_keys
    WHERE status = 'processing'
      AND updated_at < NOW() - (${staleMinutes} * INTERVAL '1 minute')
  `;

  const inserted = await rawSql`
    INSERT INTO post_idempotency_keys (key, request_hash, status, updated_at)
    VALUES (${key}, ${requestHash}, 'processing', NOW())
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  `;

  if (inserted[0]) {
    return { state: 'acquired' };
  }

  const existing = await rawSql`
    SELECT key, request_hash, status, late_post_id, response_json
    FROM post_idempotency_keys
    WHERE key = ${key}
    LIMIT 1
  `;

  const row = existing[0];
  if (!row) return { state: 'processing' };

  if (row.request_hash !== requestHash) {
    return { state: 'mismatch' };
  }

  if (row.status === 'completed') {
    return {
      state: 'completed',
      latePostId: row.late_post_id || null,
      response: row.response_json || null,
    };
  }

  return { state: 'processing' };
}

/**
 * @param {{ key: string; latePostId?: string | null; response?: unknown }} params
 */
export async function completePostIdempotency({ key, latePostId = null, response = null }) {
  if (!key) return;
  await rawSql`
    UPDATE post_idempotency_keys
    SET
      status = 'completed',
      late_post_id = ${latePostId},
      response_json = ${response ? JSON.stringify(response) : null}::jsonb,
      updated_at = NOW()
    WHERE key = ${key}
  `;
}

/**
 * @param {string} key
 */
export async function clearPostIdempotency(key) {
  if (!key) return;
  await db.delete(postIdempotencyKeys).where(eq(postIdempotencyKeys.key, key));
}

export async function findRecentDuplicatePost({ caption, videoUrl, lateAccountIds, mode = 'now', scheduledFor, withinSeconds = 30 }) {
  const normalizedCaption = caption || '';
  const normalizedVideoUrl = videoUrl || '';
  const normalizedScheduledFor = scheduledFor || null;
  const normalizedMode = mode || 'now';
  const accountIds = [...new Set((lateAccountIds || []).filter(Boolean))].sort();
  if (accountIds.length === 0) return null;

  const result = await rawSql`
    WITH recent_posts AS (
      SELECT
        late_post_id,
        created_at,
        late_account_id
      FROM posts
      WHERE created_at >= NOW() - (${withinSeconds} * INTERVAL '1 second')
        AND late_post_id IS NOT NULL
        AND COALESCE(caption, '') = ${normalizedCaption}
        AND COALESCE(video_url, '') = ${normalizedVideoUrl}
        AND (
          (${normalizedMode} = 'draft' AND status = 'draft')
          OR (${normalizedMode} = 'schedule' AND status = 'scheduled')
          OR (${normalizedMode} = 'queue' AND status = 'pending')
          OR (${normalizedMode} = 'now' AND status IN ('publishing', 'published', 'failed', 'partial'))
        )
        AND (
          (${normalizedScheduledFor}::timestamp IS NULL AND scheduled_for IS NULL)
          OR scheduled_for = ${normalizedScheduledFor}::timestamp
        )
    ),
    grouped AS (
      SELECT
        late_post_id,
        MIN(created_at) AS first_seen_at,
        COUNT(DISTINCT late_account_id) FILTER (WHERE late_account_id IS NOT NULL) AS total_accounts,
        COUNT(DISTINCT late_account_id) FILTER (WHERE late_account_id = ANY(${accountIds})) AS matched_accounts
      FROM recent_posts
      GROUP BY late_post_id
    )
    SELECT
      late_post_id,
      first_seen_at
    FROM grouped
    WHERE total_accounts = ${accountIds.length}
      AND matched_accounts = ${accountIds.length}
    ORDER BY first_seen_at DESC
    LIMIT 1
  `;

  if (!result[0]) return null;
  return {
    latePostId: result[0].late_post_id,
    createdAt: result[0].first_seen_at?.toISOString(),
  };
}
