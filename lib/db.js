import { neon } from '@neondatabase/serverless';

let _sql = null;

function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set. Please add it to your .env file.');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Tagged template function wrapper for lazy initialization
function sql(strings, ...values) {
  return getSql()(strings, ...values);
}

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
  })();

  try {
    await postsSchemaInitPromise;
  } catch (error) {
    postsSchemaInitPromise = null;
    throw error;
  }
}

// Initialize database tables (cached — only runs once per process)
let _initDbPromise = null;
export async function initDatabase() {
  if (_initDbPromise) return _initDbPromise;
  _initDbPromise = _initDatabaseImpl();
  try { await _initDbPromise; } catch (e) { _initDbPromise = null; throw e; }
  return;
}
async function _initDatabaseImpl() {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tiktok_url TEXT,
      video_url TEXT,
      video_source TEXT DEFAULT 'tiktok' CHECK (video_source IN ('tiktok', 'upload')),
      image_url TEXT NOT NULL,
      custom_prompt TEXT,
      max_seconds INTEGER DEFAULT 10,
      status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      step TEXT DEFAULT 'Waiting in queue',
      output_url TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;

  // Add video_url and video_source columns to existing jobs table if not exists
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_url TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_source TEXT DEFAULT 'tiktok'`;
  await sql`ALTER TABLE jobs ALTER COLUMN tiktok_url DROP NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS tiktok_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id TEXT UNIQUE NOT NULL,
      username TEXT,
      display_name TEXT,
      profile_picture TEXT,
      access_token TEXT,
      refresh_token TEXT,
      platform TEXT DEFAULT 'tiktok',
      profile_id TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename TEXT NOT NULL,
      original_name TEXT,
      file_type TEXT CHECK (file_type IN ('image', 'video')),
      gcs_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

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

  // Posts table migrations: add Late API tracking columns
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_post_id TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_account_id TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_post_url TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
  // Relax the status constraint to support pending/publishing states
  await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check`;
  await sql`ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK (status IN ('draft', 'pending', 'publishing', 'scheduled', 'published', 'failed', 'partial', 'cancelled'))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_late_post_id ON posts(late_post_id)`;

  // Models table (personas with multiple reference images)
  await sql`
    CREATE TABLE IF NOT EXISTS models (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Model images (multiple images per model)
  await sql`
    CREATE TABLE IF NOT EXISTS model_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      gcs_url TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      file_size INTEGER,
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create index for faster lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_model_images_model_id ON model_images(model_id)`;

  // Template jobs table (pipeline-based video processing)
  await sql`
    CREATE TABLE IF NOT EXISTS template_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      current_step INTEGER DEFAULT 0,
      total_steps INTEGER DEFAULT 0,
      step TEXT DEFAULT 'Waiting in queue',
      pipeline JSONB NOT NULL,
      video_source TEXT DEFAULT 'tiktok' CHECK (video_source IN ('tiktok', 'upload')),
      tiktok_url TEXT,
      video_url TEXT,
      output_url TEXT,
      step_results JSONB,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;

  // Add step_results column if table already exists
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS step_results JSONB`;

  // Music tracks table
  await sql`
    CREATE TABLE IF NOT EXISTS music_tracks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      gcs_url TEXT NOT NULL,
      duration REAL,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Template presets table
  await sql`
    CREATE TABLE IF NOT EXISTS template_presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      pipeline JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Pipeline batches table (groups of template jobs from batch-video-generation)
  await sql`
    CREATE TABLE IF NOT EXISTS pipeline_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
      total_jobs INTEGER DEFAULT 0,
      completed_jobs INTEGER DEFAULT 0,
      failed_jobs INTEGER DEFAULT 0,
      pipeline JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;

  // Add pipeline_batch_id to template_jobs if not exists
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS pipeline_batch_id UUID REFERENCES pipeline_batches(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_jobs_pipeline_batch_id ON template_jobs(pipeline_batch_id)`;

  // App settings (key-value store)
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Batches table (groups of related video generations)
  await sql`
    CREATE TABLE IF NOT EXISTS batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
      total_jobs INTEGER DEFAULT 0,
      completed_jobs INTEGER DEFAULT 0,
      failed_jobs INTEGER DEFAULT 0,
      model_id UUID REFERENCES models(id) ON DELETE SET NULL,
      image_selection_mode TEXT DEFAULT 'model',
      selected_image_ids TEXT[],
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;

  // Add batch_id to jobs table if not exists
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id)`;

  // Add fal_request_id to jobs and template_jobs for stuck-job recovery
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fal_request_id TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fal_endpoint TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS fal_request_id TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS fal_endpoint TEXT`;

  // Generated images (first-frame outputs)
  await sql`
    CREATE TABLE IF NOT EXISTS generated_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gcs_url TEXT NOT NULL,
      filename TEXT NOT NULL,
      model_image_url TEXT,
      scene_image_url TEXT,
      prompt_variant TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  console.log('Database tables initialized');
}

// Jobs CRUD
export async function createJob({ tiktokUrl, videoUrl, videoSource = 'tiktok', imageUrl, customPrompt, maxSeconds, batchId, status = 'processing', step = 'Starting...' }) {
  const result = await sql`
    INSERT INTO jobs (tiktok_url, video_url, video_source, image_url, custom_prompt, max_seconds, batch_id, status, step)
    VALUES (${tiktokUrl || null}, ${videoUrl || null}, ${videoSource}, ${imageUrl}, ${customPrompt || null}, ${maxSeconds || 10}, ${batchId || null}, ${status}, ${step})
    RETURNING *
  `;
  return transformJob(result[0]);
}

export async function getJob(id) {
  const result = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  return result[0] ? transformJob(result[0]) : null;
}

export async function getAllJobs() {
  const result = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
  return result.map(transformJob);
}

export async function updateJob(id, updates) {
  const { status, step, outputUrl, error, completedAt, falRequestId, falEndpoint } = updates;

  const result = await sql`
    UPDATE jobs SET
      status = COALESCE(${status || null}, status),
      step = COALESCE(${step || null}, step),
      output_url = COALESCE(${outputUrl || null}, output_url),
      error = COALESCE(${error || null}, error),
      completed_at = COALESCE(${completedAt || null}, completed_at),
      fal_request_id = COALESCE(${falRequestId || null}, fal_request_id),
      fal_endpoint = COALESCE(${falEndpoint || null}, fal_endpoint)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformJob(result[0]) : null;
}

export async function deleteJob(id) {
  await sql`DELETE FROM jobs WHERE id = ${id}`;
}

// TikTok Accounts CRUD
export async function createTikTokAccount({ accountId, username, displayName, profilePicture, accessToken, refreshToken, profileId }) {
  const result = await sql`
    INSERT INTO tiktok_accounts (account_id, username, display_name, profile_picture, access_token, refresh_token, profile_id)
    VALUES (${accountId}, ${username || null}, ${displayName || null}, ${profilePicture || null}, ${accessToken || null}, ${refreshToken || null}, ${profileId || null})
    ON CONFLICT (account_id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, tiktok_accounts.username),
      display_name = COALESCE(EXCLUDED.display_name, tiktok_accounts.display_name),
      profile_picture = COALESCE(EXCLUDED.profile_picture, tiktok_accounts.profile_picture),
      access_token = COALESCE(EXCLUDED.access_token, tiktok_accounts.access_token),
      refresh_token = COALESCE(EXCLUDED.refresh_token, tiktok_accounts.refresh_token),
      profile_id = COALESCE(EXCLUDED.profile_id, tiktok_accounts.profile_id),
      updated_at = NOW()
    RETURNING *
  `;
  return transformAccount(result[0]);
}

export async function getTikTokAccount(id) {
  const result = await sql`SELECT * FROM tiktok_accounts WHERE id = ${id}`;
  return result[0] ? transformAccount(result[0]) : null;
}

export async function getTikTokAccountByAccountId(accountId) {
  const result = await sql`SELECT * FROM tiktok_accounts WHERE account_id = ${accountId}`;
  return result[0] ? transformAccount(result[0]) : null;
}

export async function getAllTikTokAccounts() {
  const result = await sql`SELECT * FROM tiktok_accounts WHERE is_active = true ORDER BY created_at DESC`;
  return result.map(transformAccount);
}

export async function deleteTikTokAccount(id) {
  await sql`UPDATE tiktok_accounts SET is_active = false WHERE id = ${id}`;
}

// Media Files CRUD
export async function createMediaFile({ filename, originalName, fileType, gcsUrl, fileSize, mimeType, jobId }) {
  const result = await sql`
    INSERT INTO media_files (filename, original_name, file_type, gcs_url, file_size, mime_type, job_id)
    VALUES (${filename}, ${originalName || null}, ${fileType}, ${gcsUrl}, ${fileSize || null}, ${mimeType || null}, ${jobId || null})
    RETURNING *
  `;
  return transformMediaFile(result[0]);
}

export async function getMediaFile(id) {
  const result = await sql`SELECT * FROM media_files WHERE id = ${id}`;
  return result[0] ? transformMediaFile(result[0]) : null;
}

export async function getMediaFileByFilename(filename) {
  const result = await sql`SELECT * FROM media_files WHERE filename = ${filename}`;
  return result[0] ? transformMediaFile(result[0]) : null;
}

export async function getAllMediaFiles(fileType) {
  if (fileType) {
    const result = await sql`SELECT * FROM media_files WHERE file_type = ${fileType} ORDER BY created_at DESC`;
    return result.map(transformMediaFile);
  }
  const result = await sql`SELECT * FROM media_files ORDER BY created_at DESC`;
  return result.map(transformMediaFile);
}

export async function deleteMediaFile(id) {
  await sql`DELETE FROM media_files WHERE id = ${id}`;
}

// Posts CRUD
export async function createPost({ jobId, accountId, lateAccountId, caption, videoUrl, platform, status, scheduledFor, latePostId, platformPostUrl }) {
  await ensurePostsSchema();
  const result = await sql`
    INSERT INTO posts (job_id, account_id, late_account_id, caption, video_url, platform, status, scheduled_for, late_post_id, platform_post_url)
    VALUES (${jobId || null}, ${accountId || null}, ${lateAccountId || null}, ${caption || null}, ${videoUrl || null}, ${platform || 'tiktok'}, ${status || 'draft'}, ${scheduledFor || null}, ${latePostId || null}, ${platformPostUrl || null})
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

// Models CRUD
export async function createModel({ name, description, avatarUrl }) {
  const result = await sql`
    INSERT INTO models (name, description, avatar_url)
    VALUES (${name}, ${description || null}, ${avatarUrl || null})
    RETURNING *
  `;
  return transformModel(result[0]);
}

export async function getModel(id) {
  const result = await sql`SELECT * FROM models WHERE id = ${id}`;
  return result[0] ? transformModel(result[0]) : null;
}

export async function getAllModels() {
  const result = await sql`SELECT * FROM models ORDER BY created_at DESC`;
  return result.map(transformModel);
}

export async function updateModel(id, updates) {
  const { name, description, avatarUrl } = updates;
  const result = await sql`
    UPDATE models SET
      name = COALESCE(${name || null}, name),
      description = COALESCE(${description || null}, description),
      avatar_url = COALESCE(${avatarUrl || null}, avatar_url)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformModel(result[0]) : null;
}

export async function deleteModel(id) {
  await sql`DELETE FROM models WHERE id = ${id}`;
}

// Model Images CRUD
export async function createModelImage({ modelId, gcsUrl, filename, originalName, fileSize, isPrimary }) {
  // If setting as primary, unset other primaries for this model
  if (isPrimary) {
    await sql`UPDATE model_images SET is_primary = false WHERE model_id = ${modelId}`;
  }
  const result = await sql`
    INSERT INTO model_images (model_id, gcs_url, filename, original_name, file_size, is_primary)
    VALUES (${modelId}, ${gcsUrl}, ${filename}, ${originalName || null}, ${fileSize || null}, ${isPrimary || false})
    RETURNING *
  `;
  // Update model avatar if this is primary
  if (isPrimary) {
    await sql`UPDATE models SET avatar_url = ${gcsUrl} WHERE id = ${modelId}`;
  }
  return transformModelImage(result[0]);
}

export async function getModelImage(id) {
  const result = await sql`SELECT * FROM model_images WHERE id = ${id}`;
  return result[0] ? transformModelImage(result[0]) : null;
}

export async function getModelImages(modelId) {
  const result = await sql`SELECT * FROM model_images WHERE model_id = ${modelId} ORDER BY is_primary DESC, created_at ASC`;
  return result.map(transformModelImage);
}

export async function getImagesByIds(imageIds) {
  if (!imageIds || imageIds.length === 0) return [];
  const result = await sql`SELECT * FROM model_images WHERE id = ANY(${imageIds})`;
  return result.map(transformModelImage);
}

export async function setModelImagePrimary(modelId, imageId) {
  // Unset all primaries for this model
  await sql`UPDATE model_images SET is_primary = false WHERE model_id = ${modelId}`;
  // Set the specified image as primary
  const result = await sql`
    UPDATE model_images SET is_primary = true WHERE id = ${imageId} AND model_id = ${modelId}
    RETURNING *
  `;
  if (result[0]) {
    // Update model avatar
    await sql`UPDATE models SET avatar_url = ${result[0].gcs_url} WHERE id = ${modelId}`;
  }
  return result[0] ? transformModelImage(result[0]) : null;
}

export async function deleteModelImage(id) {
  const image = await getModelImage(id);
  if (image?.isPrimary) {
    // If deleting primary, set another image as primary
    const otherImages = await sql`SELECT * FROM model_images WHERE model_id = ${image.modelId} AND id != ${id} LIMIT 1`;
    if (otherImages[0]) {
      await setModelImagePrimary(image.modelId, otherImages[0].id);
    } else {
      // No other images, clear avatar
      await sql`UPDATE models SET avatar_url = NULL WHERE id = ${image.modelId}`;
    }
  }
  await sql`DELETE FROM model_images WHERE id = ${id}`;
}

// Batches CRUD
export async function createBatch({ name, modelId, imageSelectionMode, selectedImageIds, totalJobs }) {
  const result = await sql`
    INSERT INTO batches (name, model_id, image_selection_mode, selected_image_ids, total_jobs)
    VALUES (${name}, ${modelId || null}, ${imageSelectionMode || 'model'}, ${selectedImageIds || null}, ${totalJobs || 0})
    RETURNING *
  `;
  return transformBatch(result[0]);
}

export async function getBatch(id) {
  const result = await sql`SELECT * FROM batches WHERE id = ${id}`;
  return result[0] ? transformBatch(result[0]) : null;
}

export async function getAllBatches() {
  const result = await sql`SELECT * FROM batches ORDER BY created_at DESC`;
  return result.map(transformBatch);
}

export async function updateBatch(id, updates) {
  const { status, completedJobs, failedJobs, completedAt } = updates;
  const result = await sql`
    UPDATE batches SET
      status = COALESCE(${status || null}, status),
      completed_jobs = COALESCE(${completedJobs ?? null}, completed_jobs),
      failed_jobs = COALESCE(${failedJobs ?? null}, failed_jobs),
      completed_at = COALESCE(${completedAt || null}, completed_at)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformBatch(result[0]) : null;
}

export async function deleteBatch(id) {
  // Jobs will have batch_id set to NULL due to ON DELETE SET NULL
  await sql`DELETE FROM batches WHERE id = ${id}`;
}

export async function getJobsByBatchId(batchId) {
  const result = await sql`SELECT * FROM jobs WHERE batch_id = ${batchId} ORDER BY created_at ASC`;
  return result.map(transformJob);
}

export async function updateBatchProgress(batchId) {
  // Count completed and failed jobs
  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) as total
    FROM jobs WHERE batch_id = ${batchId}
  `;

  const { completed, failed, total } = stats[0];
  const completedNum = parseInt(completed) || 0;
  const failedNum = parseInt(failed) || 0;
  const totalNum = parseInt(total) || 0;

  let status = 'processing';
  let completedAt = null;

  if (completedNum + failedNum >= totalNum) {
    completedAt = new Date().toISOString();
    if (failedNum === 0) {
      status = 'completed';
    } else if (completedNum === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }
  }

  return updateBatch(batchId, {
    status,
    completedJobs: completedNum,
    failedJobs: failedNum,
    completedAt
  });
}

// Pipeline Batches CRUD
export async function createPipelineBatch({ name, pipeline, totalJobs }) {
  const result = await sql`
    INSERT INTO pipeline_batches (name, pipeline, total_jobs, status)
    VALUES (${name}, ${JSON.stringify(pipeline)}, ${totalJobs || 0}, 'pending')
    RETURNING *
  `;
  return transformPipelineBatch(result[0]);
}

export async function getPipelineBatch(id) {
  const result = await sql`SELECT * FROM pipeline_batches WHERE id = ${id}`;
  return result[0] ? transformPipelineBatch(result[0]) : null;
}

export async function getAllPipelineBatches() {
  const result = await sql`SELECT * FROM pipeline_batches ORDER BY created_at DESC`;
  return result.map(transformPipelineBatch);
}

export async function updatePipelineBatch(id, updates) {
  const { status, completedJobs, failedJobs, completedAt } = updates;
  const result = await sql`
    UPDATE pipeline_batches SET
      status = COALESCE(${status || null}, status),
      completed_jobs = COALESCE(${completedJobs ?? null}, completed_jobs),
      failed_jobs = COALESCE(${failedJobs ?? null}, failed_jobs),
      completed_at = COALESCE(${completedAt || null}, completed_at)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformPipelineBatch(result[0]) : null;
}

export async function deletePipelineBatch(id) {
  await sql`DELETE FROM pipeline_batches WHERE id = ${id}`;
}

export async function getTemplateJobsByBatchId(batchId) {
  const result = await sql`SELECT * FROM template_jobs WHERE pipeline_batch_id = ${batchId} ORDER BY created_at ASC`;
  return result.map(transformTemplateJob);
}

export async function updatePipelineBatchProgress(batchId) {
  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) as total
    FROM template_jobs WHERE pipeline_batch_id = ${batchId}
  `;

  const { completed, failed, total } = stats[0];
  const completedNum = parseInt(completed) || 0;
  const failedNum = parseInt(failed) || 0;
  const totalNum = parseInt(total) || 0;

  let status = 'processing';
  let completedAt = null;

  if (completedNum + failedNum >= totalNum) {
    completedAt = new Date().toISOString();
    if (failedNum === 0) {
      status = 'completed';
    } else if (completedNum === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }
  }

  return updatePipelineBatch(batchId, {
    status,
    completedJobs: completedNum,
    failedJobs: failedNum,
    completedAt
  });
}

// Template Jobs CRUD
export async function createTemplateJob({ name, pipeline, videoSource, tiktokUrl, videoUrl, pipelineBatchId }) {
  const totalSteps = pipeline.filter(s => s.enabled).length;
  const result = await sql`
    INSERT INTO template_jobs (name, pipeline, total_steps, video_source, tiktok_url, video_url, pipeline_batch_id)
    VALUES (${name}, ${JSON.stringify(pipeline)}, ${totalSteps}, ${videoSource || 'tiktok'}, ${tiktokUrl || null}, ${videoUrl || null}, ${pipelineBatchId || null})
    RETURNING *
  `;
  return transformTemplateJob(result[0]);
}

export async function getTemplateJob(id) {
  const result = await sql`SELECT * FROM template_jobs WHERE id = ${id}`;
  return result[0] ? transformTemplateJob(result[0]) : null;
}

export async function getAllTemplateJobs() {
  const result = await sql`SELECT * FROM template_jobs ORDER BY created_at DESC`;
  return result.map(transformTemplateJob);
}

export async function updateTemplateJob(id, updates) {
  const { status, currentStep, step, outputUrl, stepResults, error, completedAt, videoUrl, videoSource, falRequestId, falEndpoint } = updates;
  const result = await sql`
    UPDATE template_jobs SET
      status = COALESCE(${status || null}, status),
      current_step = COALESCE(${currentStep ?? null}, current_step),
      step = COALESCE(${step || null}, step),
      output_url = COALESCE(${outputUrl || null}, output_url),
      step_results = COALESCE(${stepResults ? JSON.stringify(stepResults) : null}, step_results),
      error = ${error !== undefined ? error : null},
      completed_at = COALESCE(${completedAt || null}, completed_at),
      video_url = COALESCE(${videoUrl || null}, video_url),
      video_source = COALESCE(${videoSource || null}, video_source),
      fal_request_id = COALESCE(${falRequestId || null}, fal_request_id),
      fal_endpoint = COALESCE(${falEndpoint || null}, fal_endpoint)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformTemplateJob(result[0]) : null;
}

// Template Presets CRUD
export async function createTemplatePreset({ name, description, pipeline }) {
  const result = await sql`
    INSERT INTO template_presets (name, description, pipeline)
    VALUES (${name}, ${description || null}, ${JSON.stringify(pipeline)})
    RETURNING *
  `;
  return transformTemplatePreset(result[0]);
}

export async function getAllTemplatePresets() {
  const result = await sql`SELECT * FROM template_presets ORDER BY updated_at DESC`;
  return result.map(transformTemplatePreset);
}

export async function updateTemplatePreset(id, updates) {
  const { name, description, pipeline } = updates;
  const result = await sql`
    UPDATE template_presets SET
      name = COALESCE(${name || null}, name),
      description = COALESCE(${description !== undefined ? description : null}, description),
      pipeline = COALESCE(${pipeline ? JSON.stringify(pipeline) : null}, pipeline),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformTemplatePreset(result[0]) : null;
}

export async function deleteTemplatePreset(id) {
  await sql`DELETE FROM template_presets WHERE id = ${id}`;
}

// Music Tracks CRUD
export async function createMusicTrack({ name, gcsUrl, duration, isDefault }) {
  const result = await sql`
    INSERT INTO music_tracks (name, gcs_url, duration, is_default)
    VALUES (${name}, ${gcsUrl}, ${duration || null}, ${isDefault || false})
    RETURNING *
  `;
  return transformMusicTrack(result[0]);
}

export async function getAllMusicTracks() {
  const result = await sql`SELECT * FROM music_tracks ORDER BY is_default DESC, created_at DESC`;
  return result.map(transformMusicTrack);
}

export async function deleteMusicTrack(id) {
  await sql`DELETE FROM music_tracks WHERE id = ${id}`;
}

// App Settings CRUD
export async function getSetting(key) {
  const result = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return result[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

// Generated Images CRUD
export async function createGeneratedImage({ gcsUrl, filename, modelImageUrl, sceneImageUrl, promptVariant }) {
  const result = await sql`
    INSERT INTO generated_images (gcs_url, filename, model_image_url, scene_image_url, prompt_variant)
    VALUES (${gcsUrl}, ${filename}, ${modelImageUrl || null}, ${sceneImageUrl || null}, ${promptVariant || null})
    RETURNING *
  `;
  return transformGeneratedImage(result[0]);
}

export async function getGeneratedImage(id) {
  const result = await sql`SELECT * FROM generated_images WHERE id = ${id}`;
  return result[0] ? transformGeneratedImage(result[0]) : null;
}

export async function getAllGeneratedImages() {
  const result = await sql`SELECT * FROM generated_images ORDER BY created_at DESC`;
  return result.map(transformGeneratedImage);
}

export async function deleteGeneratedImage(id) {
  await sql`DELETE FROM generated_images WHERE id = ${id}`;
}

// Transform functions (snake_case to camelCase)
function transformJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tiktokUrl: row.tiktok_url,
    videoUrl: row.video_url,
    videoSource: row.video_source || 'tiktok',
    imageUrl: row.image_url,
    imageName: row.image_url?.split('/').pop(), // For backwards compatibility
    customPrompt: row.custom_prompt,
    maxSeconds: row.max_seconds,
    status: row.status,
    step: row.step,
    outputUrl: row.output_url,
    error: row.error,
    batchId: row.batch_id,
    falRequestId: row.fal_request_id,
    falEndpoint: row.fal_endpoint,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString()
  };
}

function transformAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    displayName: row.display_name,
    profilePicture: row.profile_picture,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    platform: row.platform,
    profileId: row.profile_id,
    isActive: row.is_active,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString()
  };
}

function transformMediaFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    fileType: row.file_type,
    gcsUrl: row.gcs_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    jobId: row.job_id,
    createdAt: row.created_at?.toISOString()
  };
}

function transformPost(row) {
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
    scheduledFor: row.scheduled_for?.toISOString(),
    publishedAt: row.published_at?.toISOString(),
    externalPostId: row.external_post_id,
    latePostId: row.late_post_id,
    platformPostUrl: row.platform_post_url,
    publishAttempts: row.publish_attempts,
    lastCheckedAt: row.last_checked_at?.toISOString(),
    error: row.error,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

function transformModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at?.toISOString()
  };
}

function transformModelImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    modelId: row.model_id,
    gcsUrl: row.gcs_url,
    filename: row.filename,
    originalName: row.original_name,
    fileSize: row.file_size,
    isPrimary: row.is_primary,
    createdAt: row.created_at?.toISOString()
  };
}

function transformBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    totalJobs: row.total_jobs,
    completedJobs: row.completed_jobs,
    failedJobs: row.failed_jobs,
    modelId: row.model_id,
    imageSelectionMode: row.image_selection_mode,
    selectedImageIds: row.selected_image_ids,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString()
  };
}

function transformPipelineBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    totalJobs: row.total_jobs,
    completedJobs: row.completed_jobs,
    failedJobs: row.failed_jobs,
    pipeline: typeof row.pipeline === 'string' ? JSON.parse(row.pipeline) : row.pipeline,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString()
  };
}

function transformTemplateJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentStep: row.current_step,
    totalSteps: row.total_steps,
    step: row.step,
    pipeline: typeof row.pipeline === 'string' ? JSON.parse(row.pipeline) : row.pipeline,
    videoSource: row.video_source || 'tiktok',
    tiktokUrl: row.tiktok_url,
    videoUrl: row.video_url,
    outputUrl: row.output_url,
    stepResults: typeof row.step_results === 'string' ? JSON.parse(row.step_results) : (row.step_results || []),
    pipelineBatchId: row.pipeline_batch_id,
    falRequestId: row.fal_request_id,
    falEndpoint: row.fal_endpoint,
    error: row.error,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

function transformTemplatePreset(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pipeline: typeof row.pipeline === 'string' ? JSON.parse(row.pipeline) : row.pipeline,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

function transformMusicTrack(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gcsUrl: row.gcs_url,
    duration: row.duration,
    isDefault: row.is_default,
    createdAt: row.created_at?.toISOString(),
  };
}

function transformGeneratedImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    gcsUrl: row.gcs_url,
    filename: row.filename,
    modelImageUrl: row.model_image_url,
    sceneImageUrl: row.scene_image_url,
    promptVariant: row.prompt_variant,
    createdAt: row.created_at?.toISOString(),
  };
}

/**
 * Get jobs stuck in "processing" for longer than the given minutes threshold.
 */
export async function getStuckJobs(minutesThreshold = 10) {
  const result = await sql`
    SELECT * FROM jobs
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '1 minute' * ${minutesThreshold}
    ORDER BY created_at ASC
  `;
  return result.map(transformJob);
}

/**
 * Get template jobs stuck in "processing" for longer than the given minutes threshold.
 */
export async function getStuckTemplateJobs(minutesThreshold = 10) {
  const result = await sql`
    SELECT * FROM template_jobs
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '1 minute' * ${minutesThreshold}
    ORDER BY created_at ASC
  `;
  return result.map(transformTemplateJob);
}

export { sql };
