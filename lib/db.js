export { sql } from './db-client';
export { db } from './drizzle';
export { initDatabase, ensureDatabaseReady } from './db-schema';

export {
  createJob,
  getJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getJobsByBatchId,
  getStuckJobs,
  getJobByFalRequestId,
  getCompletedJobVideos,
} from './db-jobs';

export {
  createTikTokAccount,
  getTikTokAccount,
  getTikTokAccountByAccountId,
  getAllTikTokAccounts,
  deleteTikTokAccount,
} from './db-accounts';

export {
  createMediaFile,
  getMediaFile,
  getMediaFileByFilename,
  getAllMediaFiles,
  deleteMediaFile,
} from './db-media-files';

export {
  createPost,
  getPost,
  getAllPosts,
  getPostsByJobIds,
  updatePost,
  getPostByLateId,
  getPostApiKeyIndex,
  updatePostByLateId,
  getPendingPosts,
  beginPostIdempotency,
  completePostIdempotency,
  clearPostIdempotency,
  acquirePostRequestLock,
  releasePostRequestLock,
  findRecentDuplicatePost,
} from './db-posts';

export {
  createModel,
  getModel,
  getAllModels,
  updateModel,
  deleteModel,
  getModelGroups,
  getAllModelGroupMemberships,
  setModelGroups,
  addModelToGroup,
  removeModelFromGroup,
  removeAllMembershipsForGroup,
  renameGroupMemberships,
  updateModelsGroupName,
  clearModelsGroupName,
} from './db-models';

export {
  createModelImage,
  getModelImage,
  getModelImages,
  getModelImageCountsForModels,
  getImagesByIds,
  setModelImagePrimary,
  deleteModelImage,
} from './db-model-images';

export {
  createBatch,
  getBatch,
  getAllBatches,
  updateBatch,
  deleteBatch,
  updateBatchProgress,
} from './db-batches';

export {
  createPipelineBatch,
  getPipelineBatch,
  getAllPipelineBatches,
  updatePipelineBatch,
  updateMasterConfig,
  deletePipelineBatch,
  updatePipelineBatchProgress,
} from './db-pipeline-batches';

export {
  createModelAccountMapping,
  getModelAccountMappings,
  getModelAccountMappingsForModels,
  deleteModelAccountMapping,
  deleteModelAccountMappingsByModel,
  replaceModelAccountMappings,
  getAccountToModelMap,
  getAllModelAccountMappingsWithModelNames,
} from './db-model-account-mappings';

export {
  updateTemplateJobPostStatus,
  acquireTemplateJobPostLock,
  releaseTemplateJobPostLock,
  createTemplateJob,
  getTemplateJob,
  deleteTemplateJob,
  getAllTemplateJobs,
  updateTemplateJob,
  getTemplateJobsByBatchId,
  getStuckTemplateJobs,
  getStuckQueuedTemplateJobs,
  getTemplateJobByFalRequestId,
  updateTemplateJobOverrides,
  getCompletedTemplateJobVideos,
  getTemplateJobsWithRelations,
  failQueuedJobsInBatch,
  failProcessingJobsInBatch,
  getTemplateJobsWithPipelineStep,
} from './db-template-jobs';

export {
  createTemplatePreset,
  getAllTemplatePresets,
  updateTemplatePreset,
  deleteTemplatePreset,
} from './db-template-presets';

export {
  createMusicTrack,
  getAllMusicTracks,
  deleteMusicTrack,
} from './db-music-tracks';

export {
  getSetting,
  setSetting,
} from './db-settings';

export {
  getAllTrendingTracks,
  getTrendingTracksCacheAge,
  replaceTrendingTracks,
} from './db-trending-tracks';

export {
  createGeneratedImage,
  getGeneratedImage,
  getAllGeneratedImages,
  getGeneratedImagesPage,
  getGeneratedImagesCount,
  getGeneratedImagesByModelId,
  deleteGeneratedImage,
} from './db-generated-images';

export {
  saveProfileApiKey,
  getProfileApiKey,
  getProfileApiKeysBatch,
  getProfileCountPerKey,
  deleteProfileApiKey,
} from './db-late-profile-keys';

export {
  createCustomVariable,
  getAllCustomVariables,
  getCustomVariable,
  updateCustomVariable,
  deleteCustomVariable,
  getJobVariableValues,
  getJobVariableValuesByTemplateJobIds,
  setJobVariableValues,
  deleteJobVariableValues,
  getPivotData,
  copyJobVariablesToMediaVariables,
  deleteMediaVariableValues,
  syncJobVariablesToMedia,
  getMediaVariableValuesByExternalIds,
  getPostVariableValuesByExternalIds,
} from './db-custom-variables';

export {
  createGenerationRequest,
  updateGenerationRequest,
  getGenerationRequestStats,
} from './db-generation-requests';

export {
  createTwitterPipeline,
  getTwitterPipeline,
  getAllTwitterPipelines,
  updateTwitterPipeline,
  deleteTwitterPipeline,
} from './db-twitter-pipelines';

export {
  createAnalyticsAccount,
  getAnalyticsAccount,
  getAllAnalyticsAccounts,
  updateAnalyticsAccount,
  deleteAnalyticsAccount,
  upsertAccountSnapshot,
  getAccountSnapshots,
  getAllAccountSnapshots,
  upsertMediaItem,
  getMediaExternalIds,
  getMediaItemsByAccount,
  getAllMediaItems,
  upsertMediaSnapshot,
  getAccountMediaTotals,
  getPostingActivity,
  getAnalyticsOverview,
  linkMediaItemToJob,
  linkMediaItemsByExternalPostId,
  getUnlinkedMediaItems,
  setMediaItemJobId,
  getLinkedMediaItemsByJobId,
  getPostingTimesBucket,
} from './db-analytics';
