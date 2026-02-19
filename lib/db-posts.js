import { sql } from './db-client';
import { transformPost } from './db-transforms';

let postsSchemaInitPromise = null;

async function ensurePostsSchema() {
  if (postsSchemaInitPromise) {
    await postsSchemaInitPromise;
    return;
  }

  postsSchemaInitPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
        account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
        caption TEXT,
        video_url TEXT,
        platform TEXT DEFAULT 'tiktok',
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
        scheduled_for TIMESTAMP,
        published_at TIMESTAMP,
        external_post_id TEXT,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_post_id TEXT`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_account_id TEXT`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_post_url TEXT`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
    await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check`;
    await sql`ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK (status IN ('draft', 'pending', 'publishing', 'scheduled', 'published', 'failed', 'partial', 'cancelled'))`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_late_post_id ON posts(late_post_id)`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_by TEXT`;
    await sql`
      DELETE FROM posts
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY job_id, late_account_id, platform
              ORDER BY created_at DESC, id DESC
            ) AS rn
          FROM posts
          WHERE job_id IS NOT NULL
            AND late_account_id IS NOT NULL
            AND platform IS NOT NULL
        ) ranked
        WHERE ranked.rn > 1
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_job_account_platform_unique ON posts(job_id, late_account_id, platform)`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_idempotency_keys (
        key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
        late_post_id TEXT,
        response_json JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_post_idempotency_keys_status ON post_idempotency_keys(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_post_idempotency_keys_updated_at ON post_idempotency_keys(updated_at)`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_request_locks (
        lock_key TEXT PRIMARY KEY,
        locked_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_post_request_locks_locked_at ON post_request_locks(locked_at)`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS api_key_index INTEGER DEFAULT 0`;
  })();

  try {
    await postsSchemaInitPromise;
  } catch (error) {
    postsSchemaInitPromise = null;
    throw error;
  }
}

export async function createPost({ jobId, accountId, lateAccountId, caption, videoUrl, platform, status, scheduledFor, latePostId, platformPostUrl, createdBy, apiKeyIndex = 0 }) {
  await ensurePostsSchema();
  const result = await sql`
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
  return transformPost(result[0]);
}

export async function getPost(id) {
  const result = await sql`SELECT * FROM posts WHERE id = ${id}`;
  return result[0] ? transformPost(result[0]) : null;
}

export async function getAllPosts() {
  await ensurePostsSchema();
  const result = await sql`SELECT * FROM posts ORDER BY created_at DESC`;
  return result.map(transformPost);
}

export async function getPostsByJobIds(jobIds) {
  if (!jobIds || jobIds.length === 0) return [];
  await ensurePostsSchema();
  const result = await sql`SELECT * FROM posts WHERE job_id = ANY(${jobIds}) ORDER BY created_at DESC`;
  return result.map(transformPost);
}

export async function updatePost(id, updates) {
  await ensurePostsSchema();
  const { status, publishedAt, externalPostId, error, latePostId, platformPostUrl, publishAttempts, lastCheckedAt } = updates;

  const result = await sql`
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
  return result[0] ? transformPost(result[0]) : null;
}

export async function getPostByLateId(latePostId) {
  await ensurePostsSchema();
  const result = await sql`SELECT * FROM posts WHERE late_post_id = ${latePostId}`;
  return result[0] ? transformPost(result[0]) : null;
}

export async function getPostApiKeyIndex(latePostId) {
  await ensurePostsSchema();
  const result = await sql`SELECT api_key_index FROM posts WHERE late_post_id = ${latePostId} LIMIT 1`;
  return result[0]?.api_key_index ?? null;
}

export async function updatePostByLateId(latePostId, updates) {
  await ensurePostsSchema();
  const { status, publishedAt, externalPostId, error, platformPostUrl, publishAttempts, lastCheckedAt } = updates;

  const result = await sql`
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
  return result[0] ? transformPost(result[0]) : null;
}

export async function getPendingPosts() {
  await ensurePostsSchema();
  const result = await sql`
    SELECT * FROM posts
    WHERE status IN ('pending', 'publishing', 'scheduled')
      AND late_post_id IS NOT NULL
    ORDER BY created_at DESC
  `;
  return result.map(transformPost);
}

export async function acquirePostRequestLock(lockKey, staleMinutes = 15) {
  if (!lockKey) return false;
  await ensurePostsSchema();

  await sql`
    DELETE FROM post_request_locks
    WHERE locked_at < NOW() - (${staleMinutes} * INTERVAL '1 minute')
  `;

  const result = await sql`
    INSERT INTO post_request_locks (lock_key, locked_at)
    VALUES (${lockKey}, NOW())
    ON CONFLICT (lock_key) DO NOTHING
    RETURNING lock_key
  `;

  return !!result[0];
}

export async function releasePostRequestLock(lockKey) {
  if (!lockKey) return;
  await ensurePostsSchema();
  await sql`DELETE FROM post_request_locks WHERE lock_key = ${lockKey}`;
}

/**
 * @param {{ key: string; requestHash: string; staleMinutes?: number }} params
 */
export async function beginPostIdempotency({ key, requestHash, staleMinutes = 30 }) {
  if (!key || !requestHash) {
    throw new Error('Both key and requestHash are required for idempotency');
  }
  await ensurePostsSchema();

  await sql`
    DELETE FROM post_idempotency_keys
    WHERE status = 'processing'
      AND updated_at < NOW() - (${staleMinutes} * INTERVAL '1 minute')
  `;

  const inserted = await sql`
    INSERT INTO post_idempotency_keys (key, request_hash, status, updated_at)
    VALUES (${key}, ${requestHash}, 'processing', NOW())
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  `;

  if (inserted[0]) {
    return { state: 'acquired' };
  }

  const existing = await sql`
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
  await ensurePostsSchema();
  await sql`
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
  await ensurePostsSchema();
  await sql`DELETE FROM post_idempotency_keys WHERE key = ${key}`;
}

export async function findRecentDuplicatePost({ caption, videoUrl, lateAccountIds, mode = 'now', scheduledFor, withinSeconds = 30 }) {
  await ensurePostsSchema();
  const normalizedCaption = caption || '';
  const normalizedVideoUrl = videoUrl || '';
  const normalizedScheduledFor = scheduledFor || null;
  const normalizedMode = mode || 'now';
  const accountIds = [...new Set((lateAccountIds || []).filter(Boolean))].sort();
  if (accountIds.length === 0) return null;

  const result = await sql`
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
