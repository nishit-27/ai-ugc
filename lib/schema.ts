import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  real,
  bigint,
  jsonb,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── Jobs (legacy) ──

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tiktokUrl: text('tiktok_url'),
  videoUrl: text('video_url'),
  videoSource: text('video_source').notNull().default('tiktok'),
  imageUrl: text('image_url').notNull(),
  customPrompt: text('custom_prompt'),
  maxSeconds: integer('max_seconds').notNull().default(10),
  status: text('status').notNull().default('queued'),
  step: text('step').notNull().default('Waiting in queue'),
  outputUrl: text('output_url'),
  error: text('error'),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  falRequestId: text('fal_request_id'),
  falEndpoint: text('fal_endpoint'),
  falRecoveryToken: text('fal_recovery_token'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// ── TikTok Accounts ──

export const tiktokAccounts = pgTable('tiktok_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull().unique(),
  username: text('username'),
  displayName: text('display_name'),
  profilePicture: text('profile_picture'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  platform: text('platform').notNull().default('tiktok'),
  profileId: text('profile_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Media Files ──

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  originalName: text('original_name'),
  fileType: text('file_type'),
  gcsUrl: text('gcs_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Models ──

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  groupName: text('group_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Model Group Memberships ──

export const modelGroupMemberships = pgTable('model_group_memberships', {
  modelId: uuid('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  groupName: text('group_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('model_group_memberships_model_id_group_name_key').on(t.modelId, t.groupName),
  index('idx_model_group_memberships_model_id').on(t.modelId),
  index('idx_model_group_memberships_group_name').on(t.groupName),
]);

// ── Model Images ──

export const modelImages = pgTable('model_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  gcsUrl: text('gcs_url').notNull(),
  filename: text('filename').notNull(),
  originalName: text('original_name'),
  fileSize: integer('file_size'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_model_images_model_id').on(t.modelId),
]);

// ── Pipeline Batches ──

export const pipelineBatches = pgTable('pipeline_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  totalJobs: integer('total_jobs').notNull().default(0),
  completedJobs: integer('completed_jobs').notNull().default(0),
  failedJobs: integer('failed_jobs').notNull().default(0),
  pipeline: jsonb('pipeline'),
  isMaster: boolean('is_master').notNull().default(false),
  masterConfig: jsonb('master_config'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// ── Template Jobs ──

export const templateJobs = pgTable('template_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('queued'),
  currentStep: integer('current_step').notNull().default(0),
  totalSteps: integer('total_steps').notNull().default(0),
  step: text('step').notNull().default('Waiting in queue'),
  pipeline: jsonb('pipeline').notNull(),
  videoSource: text('video_source').notNull().default('tiktok'),
  tiktokUrl: text('tiktok_url'),
  videoUrl: text('video_url'),
  sourceTrimStart: real('source_trim_start'),
  sourceTrimEnd: real('source_trim_end'),
  outputUrl: text('output_url'),
  stepResults: jsonb('step_results'),
  error: text('error'),
  pipelineBatchId: uuid('pipeline_batch_id').references(() => pipelineBatches.id, { onDelete: 'set null' }),
  modelId: uuid('model_id').references(() => models.id, { onDelete: 'set null' }),
  postStatus: text('post_status'),
  regeneratedFrom: uuid('regenerated_from'),
  captionOverride: text('caption_override'),
  publishModeOverride: text('publish_mode_override'),
  scheduledForOverride: text('scheduled_for_override'),
  timezoneOverride: text('timezone_override'),
  falRequestId: text('fal_request_id'),
  falEndpoint: text('fal_endpoint'),
  falRecoveryToken: text('fal_recovery_token'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  index('idx_template_jobs_pipeline_batch_id').on(t.pipelineBatchId),
  index('idx_template_jobs_fal_request_id').on(t.falRequestId),
]);

// ── Template Job Post Locks ──

export const templateJobPostLocks = pgTable('template_job_post_locks', {
  jobId: uuid('job_id').primaryKey().references(() => templateJobs.id, { onDelete: 'cascade' }),
  lockedAt: timestamp('locked_at').defaultNow(),
}, (t) => [
  index('idx_template_job_post_locks_locked_at').on(t.lockedAt),
]);

// ── Posts ──

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  accountId: uuid('account_id').references(() => tiktokAccounts.id, { onDelete: 'set null' }),
  lateAccountId: text('late_account_id'),
  caption: text('caption'),
  videoUrl: text('video_url'),
  platform: text('platform').notNull().default('tiktok'),
  status: text('status').notNull().default('draft'),
  scheduledFor: timestamp('scheduled_for'),
  publishedAt: timestamp('published_at'),
  externalPostId: text('external_post_id'),
  latePostId: text('late_post_id'),
  platformPostUrl: text('platform_post_url'),
  publishAttempts: integer('publish_attempts').notNull().default(0),
  lastCheckedAt: timestamp('last_checked_at'),
  error: text('error'),
  apiKeyIndex: integer('api_key_index').notNull().default(0),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  uniqueIndex('idx_posts_job_account_platform_unique').on(t.jobId, t.lateAccountId, t.platform),
  index('idx_posts_late_post_id').on(t.latePostId),
]);

// ── Post Idempotency Keys ──

export const postIdempotencyKeys = pgTable('post_idempotency_keys', {
  key: text('key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  status: text('status').notNull(),
  latePostId: text('late_post_id'),
  responseJson: jsonb('response_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  index('idx_post_idempotency_keys_status').on(t.status),
  index('idx_post_idempotency_keys_updated_at').on(t.updatedAt),
]);

// ── Post Request Locks ──

export const postRequestLocks = pgTable('post_request_locks', {
  lockKey: text('lock_key').primaryKey(),
  lockedAt: timestamp('locked_at').defaultNow(),
}, (t) => [
  index('idx_post_request_locks_locked_at').on(t.lockedAt),
]);

// ── Batches (legacy) ──

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  totalJobs: integer('total_jobs').notNull().default(0),
  completedJobs: integer('completed_jobs').notNull().default(0),
  failedJobs: integer('failed_jobs').notNull().default(0),
  modelId: uuid('model_id').references(() => models.id, { onDelete: 'set null' }),
  imageSelectionMode: text('image_selection_mode').notNull().default('model'),
  selectedImageIds: text('selected_image_ids').array(),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// ── Music Tracks ──

export const musicTracks = pgTable('music_tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  gcsUrl: text('gcs_url').notNull(),
  duration: real('duration'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Template Presets ──

export const templatePresets = pgTable('template_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  pipeline: jsonb('pipeline').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Generated Images ──

export const generatedImages = pgTable('generated_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  gcsUrl: text('gcs_url').notNull(),
  filename: text('filename').notNull(),
  modelImageUrl: text('model_image_url'),
  sceneImageUrl: text('scene_image_url'),
  promptVariant: text('prompt_variant'),
  modelId: uuid('model_id').references(() => models.id, { onDelete: 'set null' }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_generated_images_created_at').on(t.createdAt),
  index('idx_generated_images_model_created').on(t.modelId, t.createdAt),
]);

// ── Model Account Mappings ──

export const modelAccountMappings = pgTable('model_account_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id').notNull().references(() => models.id, { onDelete: 'cascade' }),
  lateAccountId: text('late_account_id').notNull(),
  platform: text('platform').notNull(),
  apiKeyIndex: integer('api_key_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('model_account_mappings_model_id_late_account_id_key').on(t.modelId, t.lateAccountId),
  index('idx_model_account_mappings_model_id').on(t.modelId),
]);

// ── Trending Tracks ──

export const trendingTracks = pgTable('trending_tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tiktokId: text('tiktok_id').notNull().unique(),
  title: text('title').notNull(),
  author: text('author'),
  album: text('album'),
  playUrl: text('play_url'),
  coverUrl: text('cover_url'),
  duration: real('duration'),
  gcsUrl: text('gcs_url'),
  fetchedAt: timestamp('fetched_at').defaultNow(),
}, (t) => [
  index('idx_trending_tracks_fetched_at').on(t.fetchedAt),
]);

// ── App Settings ──

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Analytics Accounts ──

export const analyticsAccounts = pgTable('analytics_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  username: text('username').notNull(),
  accountId: text('account_id'),
  displayName: text('display_name'),
  profileUrl: text('profile_url'),
  lateAccountId: text('late_account_id'),
  followers: integer('followers').default(0),
  totalViews: bigint('total_views', { mode: 'number' }).default(0),
  totalLikes: bigint('total_likes', { mode: 'number' }).default(0),
  totalComments: bigint('total_comments', { mode: 'number' }).default(0),
  totalShares: bigint('total_shares', { mode: 'number' }).default(0),
  engagementRate: real('engagement_rate').default(0),
  lastSyncedAt: timestamp('last_synced_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('analytics_accounts_platform_username_key').on(t.platform, t.username),
  index('idx_analytics_accounts_late_account_id').on(t.lateAccountId),
]);

// ── Analytics Account Snapshots ──

export const analyticsAccountSnapshots = pgTable('analytics_account_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => analyticsAccounts.id, { onDelete: 'cascade' }),
  followers: integer('followers').default(0),
  totalViews: bigint('total_views', { mode: 'number' }).default(0),
  totalLikes: bigint('total_likes', { mode: 'number' }).default(0),
  totalComments: bigint('total_comments', { mode: 'number' }).default(0),
  totalShares: bigint('total_shares', { mode: 'number' }).default(0),
  engagementRate: real('engagement_rate').default(0),
  snapshotDate: date('snapshot_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('analytics_account_snapshots_account_id_snapshot_date_key').on(t.accountId, t.snapshotDate),
  index('idx_analytics_account_snapshots_account').on(t.accountId, t.snapshotDate),
]);

// ── Analytics Media Items ──

export const analyticsMediaItems = pgTable('analytics_media_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => analyticsAccounts.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  externalId: text('external_id').notNull(),
  title: text('title'),
  caption: text('caption'),
  url: text('url'),
  thumbnailUrl: text('thumbnail_url'),
  publishedAt: timestamp('published_at'),
  views: bigint('views', { mode: 'number' }).default(0),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  saves: integer('saves').default(0),
  engagementRate: real('engagement_rate').default(0),
  templateJobId: uuid('template_job_id').references(() => templateJobs.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('analytics_media_items_account_id_external_id_key').on(t.accountId, t.externalId),
  index('idx_analytics_media_items_account').on(t.accountId),
  index('idx_analytics_media_items_views').on(t.views),
  index('idx_analytics_media_items_url').on(t.url),
  index('idx_ami_template_job_id').on(t.templateJobId),
]);

// ── Analytics Media Snapshots ──

export const analyticsMediaSnapshots = pgTable('analytics_media_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaItemId: uuid('media_item_id').notNull().references(() => analyticsMediaItems.id, { onDelete: 'cascade' }),
  views: bigint('views', { mode: 'number' }).default(0),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  engagementRate: real('engagement_rate').default(0),
  snapshotDate: date('snapshot_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('analytics_media_snapshots_media_item_id_snapshot_date_key').on(t.mediaItemId, t.snapshotDate),
  index('idx_analytics_media_snapshots_media').on(t.mediaItemId, t.snapshotDate),
]);

// ── Custom Variables ──

export const customVariables = pgTable('custom_variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  type: text('type').notNull(),
  options: jsonb('options'),
  color: text('color'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Job Variable Values ──

export const jobVariableValues = pgTable('job_variable_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateJobId: uuid('template_job_id').notNull().references(() => templateJobs.id, { onDelete: 'cascade' }),
  variableId: uuid('variable_id').notNull().references(() => customVariables.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('job_variable_values_template_job_id_variable_id_key').on(t.templateJobId, t.variableId),
  index('idx_job_variable_values_job').on(t.templateJobId),
  index('idx_job_variable_values_variable').on(t.variableId),
]);

// ── Media Variable Values ──

export const mediaVariableValues = pgTable('media_variable_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaItemId: uuid('media_item_id').notNull().references(() => analyticsMediaItems.id, { onDelete: 'cascade' }),
  variableId: uuid('variable_id').notNull().references(() => customVariables.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('media_variable_values_media_item_id_variable_id_key').on(t.mediaItemId, t.variableId),
  index('idx_mvv_media_item_id').on(t.mediaItemId),
  index('idx_mvv_variable_id').on(t.variableId),
]);

// ── Generation Requests ──

export const generationRequests = pgTable('generation_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull().default('processing'),
  cost: real('cost'),
  durationSeconds: real('duration_seconds'),
  error: text('error'),
  metadata: jsonb('metadata'),
  createdBy: text('created_by'),
  createdByEmail: text('created_by_email'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_generation_requests_created_at').on(t.createdAt),
  index('idx_generation_requests_type').on(t.type),
  index('idx_generation_requests_status').on(t.status),
]);

// ── Late Profile API Keys ──

export const lateProfileApiKeys = pgTable('late_profile_api_keys', {
  lateProfileId: text('late_profile_id').primaryKey(),
  apiKeyIndex: integer('api_key_index').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Twitter Pipelines ──

export const twitterPipelines = pgTable('twitter_pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  steps: jsonb('steps').notNull().default([]),
  accountIds: jsonb('account_ids').notNull().default([]),
  scheduledFor: timestamp('scheduled_for'),
  timezone: text('timezone'),
  error: text('error'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  index('idx_twitter_pipelines_status').on(t.status),
  index('idx_twitter_pipelines_created_at').on(t.createdAt),
]);
