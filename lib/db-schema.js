import { sql } from './db-client';

let _initDbPromise = null;
let _ensureDbReadyPromise = null;
const CORE_DB_TABLES = ['jobs', 'template_jobs', 'generated_images', 'models'];

export async function initDatabase() {
  if (_initDbPromise) return _initDbPromise;
  _initDbPromise = _initDatabaseImpl();
  try {
    await _initDbPromise;
  } catch (error) {
    _initDbPromise = null;
    throw error;
  }
}

export async function ensureDatabaseReady() {
  if (_initDbPromise) {
    await _initDbPromise;
    return;
  }
  if (_ensureDbReadyPromise) {
    await _ensureDbReadyPromise;
    return;
  }

  _ensureDbReadyPromise = (async () => {
    const checks = await Promise.all(
      CORE_DB_TABLES.map(async (table) => {
        const result = await sql`SELECT to_regclass(${`public.${table}`}) AS regclass`;
        return !!result[0]?.regclass;
      }),
    );

    if (checks.some((exists) => !exists)) {
      await initDatabase();
    }
  })();

  try {
    await _ensureDbReadyPromise;
  } catch (error) {
    _ensureDbReadyPromise = null;
    throw error;
  }
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

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_post_id TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS late_account_id TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_post_url TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check`;
  await sql`ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK (status IN ('draft', 'pending', 'publishing', 'scheduled', 'published', 'failed', 'partial', 'cancelled'))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_late_post_id ON posts(late_post_id)`;
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

  await sql`
    CREATE TABLE IF NOT EXISTS models (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

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

  await sql`CREATE INDEX IF NOT EXISTS idx_model_images_model_id ON model_images(model_id)`;

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

  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS step_results JSONB`;

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

  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS pipeline_batch_id UUID REFERENCES pipeline_batches(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_jobs_pipeline_batch_id ON template_jobs(pipeline_batch_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

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

  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id)`;

  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fal_request_id TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fal_endpoint TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS fal_request_id TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS fal_endpoint TEXT`;

  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_fal_request_id ON jobs(fal_request_id) WHERE fal_request_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_jobs_fal_request_id ON template_jobs(fal_request_id) WHERE fal_request_id IS NOT NULL`;

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
  await sql`CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS model_account_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      late_account_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(model_id, late_account_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_model_account_mappings_model_id ON model_account_mappings(model_id)`;

  await sql`ALTER TABLE pipeline_batches ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE pipeline_batches ADD COLUMN IF NOT EXISTS master_config JSONB`;

  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS post_status TEXT DEFAULT NULL`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS regenerated_from UUID REFERENCES template_jobs(id) ON DELETE SET NULL`;

  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS caption_override TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS publish_mode_override TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS scheduled_for_override TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS timezone_override TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS template_job_post_locks (
      job_id UUID PRIMARY KEY REFERENCES template_jobs(id) ON DELETE CASCADE,
      locked_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_job_post_locks_locked_at ON template_job_post_locks(locked_at)`;

  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE template_jobs ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE pipeline_batches ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_generated_images_model_id ON generated_images(model_id) WHERE model_id IS NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS trending_tracks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tiktok_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      album TEXT,
      play_url TEXT,
      cover_url TEXT,
      duration REAL,
      gcs_url TEXT,
      fetched_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_trending_tracks_fetched_at ON trending_tracks(fetched_at DESC)`;

  console.log('Database tables initialized');
}
