export function transformJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tiktokUrl: row.tiktok_url,
    videoUrl: row.video_url,
    videoSource: row.video_source || 'tiktok',
    imageUrl: row.image_url,
    imageName: row.image_url?.split('/').pop(),
    customPrompt: row.custom_prompt,
    maxSeconds: row.max_seconds,
    status: row.status,
    step: row.step,
    outputUrl: row.output_url,
    error: row.error,
    batchId: row.batch_id,
    falRequestId: row.fal_request_id,
    falEndpoint: row.fal_endpoint,
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

export function transformAccount(row) {
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
    updatedAt: row.updated_at?.toISOString(),
  };
}

export function transformMediaFile(row) {
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
    createdAt: row.created_at?.toISOString(),
  };
}

export function transformPost(row) {
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
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

export function transformModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at?.toISOString(),
  };
}

export function transformModelImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    modelId: row.model_id,
    gcsUrl: row.gcs_url,
    filename: row.filename,
    originalName: row.original_name,
    fileSize: row.file_size,
    isPrimary: row.is_primary,
    createdAt: row.created_at?.toISOString(),
  };
}

export function transformBatch(row) {
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
    completedAt: row.completed_at?.toISOString(),
  };
}

export function transformPipelineBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    totalJobs: row.total_jobs,
    completedJobs: row.completed_jobs,
    failedJobs: row.failed_jobs,
    pipeline: typeof row.pipeline === 'string' ? JSON.parse(row.pipeline) : row.pipeline,
    isMaster: row.is_master || false,
    masterConfig: typeof row.master_config === 'string' ? JSON.parse(row.master_config) : (row.master_config || null),
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

export function transformTemplateJob(row) {
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
    modelId: row.model_id || null,
    postStatus: row.post_status || null,
    regeneratedFrom: row.regenerated_from || null,
    captionOverride: row.caption_override || null,
    publishModeOverride: row.publish_mode_override || null,
    scheduledForOverride: row.scheduled_for_override || null,
    timezoneOverride: row.timezone_override || null,
    falRequestId: row.fal_request_id,
    falEndpoint: row.fal_endpoint,
    error: row.error,
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

export function transformTemplatePreset(row) {
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

export function transformMusicTrack(row) {
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

export function transformModelAccountMapping(row) {
  if (!row) return null;
  return {
    id: row.id,
    modelId: row.model_id,
    lateAccountId: row.late_account_id,
    platform: row.platform,
    createdAt: row.created_at?.toISOString(),
  };
}

export function transformTrendingTrack(row) {
  if (!row) return null;
  return {
    id: row.id,
    tiktokId: row.tiktok_id,
    title: row.title,
    author: row.author,
    album: row.album,
    playUrl: row.play_url,
    coverUrl: row.cover_url,
    duration: row.duration,
    gcsUrl: row.gcs_url,
    fetchedAt: row.fetched_at?.toISOString(),
  };
}

export function transformGeneratedImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    gcsUrl: row.gcs_url,
    filename: row.filename,
    modelImageUrl: row.model_image_url,
    sceneImageUrl: row.scene_image_url,
    promptVariant: row.prompt_variant,
    modelId: row.model_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at?.toISOString(),
  };
}
