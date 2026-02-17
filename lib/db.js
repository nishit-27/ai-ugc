export { sql } from './db-client';
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
  getTemplateJobByFalRequestId,
  updateTemplateJobOverrides,
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
