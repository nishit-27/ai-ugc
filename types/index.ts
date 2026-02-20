export type Job = {
  id: string;
  tiktokUrl?: string;
  videoUrl?: string;
  videoSource?: 'tiktok' | 'upload';
  imageUrl: string;
  imageName?: string;
  status: string;
  step: string;
  outputUrl?: string;
  signedUrl?: string;
  createdBy?: string;
  createdAt: string;
};

export type PostPlatform = {
  platform: string;
  accountId?: string | { _id: string };
  status?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  publishedAt?: string;
  errorMessage?: string;
  errorCategory?: string;
  errorSource?: string;
};

export type Post = {
  _id: string;
  title?: string;
  content?: string;
  status?: string;
  derivedStatus?: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'partial' | 'cancelled';
  modelId?: string;
  modelName?: string;
  scheduledFor?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  mediaItems?: { type?: string; url?: string; thumbnailUrl?: string }[];
  platforms?: PostPlatform[];
  apiKeyIndex?: number;
  accountLabel?: string;
};

export type Profile = {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  apiKeyIndex?: number;
  accountLabel?: string;
};

export type Account = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  createdAt?: string;
  profileId?: { _id: string } | string;
  apiKeyIndex?: number;
  accountLabel?: string;
};

export type Model = {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  avatarGcsUrl?: string;
  imageCount?: number;
  accountCount?: number;
  linkedPlatforms?: string[];
  createdAt?: string;
};

export type ModelImage = {
  id: string;
  modelId: string;
  gcsUrl: string;
  signedUrl?: string;
  filename: string;
  isPrimary?: boolean;
};

export type Batch = {
  id: string;
  name: string;
  status: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  progress?: number;
  model?: { id: string; name: string; avatarUrl?: string };
  jobs?: Job[];
  createdAt?: string;
};

// Templates / Pipeline types

export type MiniAppType = 'video-generation' | 'batch-video-generation' | 'text-overlay' | 'bg-music' | 'attach-video' | 'compose';

export type VideoGenMode = 'motion-control' | 'subtle-animation';

export type VideoGenConfig = {
  mode: VideoGenMode;
  modelId?: string;
  imageId?: string;
  imageUrl?: string;
  prompt?: string;
  maxSeconds?: number;
  // Shared settings (toolbar controls)
  aspectRatio?: string;            // '9:16' | '16:9' | 'auto'
  duration?: string;               // Veo: '4s'|'6s'|'8s'
  generateAudio?: boolean;         // Veo: generate_audio, Motion: keep_original_sound
  negativePrompt?: string;
  // Veo-only
  resolution?: '720p' | '1080p' | '4k';
  // First Frame Generation
  firstFrameEnabled?: boolean;
  extractedFrameUrl?: string;      // GCS URL of the picked extracted frame
  firstFrameResolution?: '1K' | '2K' | '4K';
  firstFrameProvider?: 'gemini' | 'fal' | 'gpt-image';
  // Master mode: per-model first frame selections (modelId → selected first frame GCS URL)
  masterFirstFrames?: Record<string, string>;
};

export type TextOverlayConfig = {
  text: string;
  position: 'top' | 'center' | 'bottom' | 'custom';
  textAlign?: 'left' | 'center' | 'right';
  customX?: number;       // 0-100 percentage
  customY?: number;       // 0-100 percentage
  fontSize: number;
  fontColor: string;
  fontFamily?: string;
  textStyle?: string;     // style preset id
  bgColor?: string;
  paddingLeft?: number;   // pixels from left edge (controls text width / line wrapping)
  paddingRight?: number;  // pixels from right edge
  wordsPerLine?: number;  // 0 = no limit (single line)
  entireVideo?: boolean;
  startTime?: number;
  duration?: number;
};

export type BgMusicConfig = {
  trackId?: string;
  trendingTrackId?: string;
  customTrackUrl?: string;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  applyToSteps?: string[]; // step IDs to apply music to; empty/undefined = all video steps
  audioModePerStep?: Record<string, 'replace' | 'mix'>; // per-step audio mode
  audioMode?: 'replace' | 'mix'; // effective mode used by backend (derived from audioModePerStep)
};

export type AttachVideoConfig = {
  videoUrl: string;
  position: 'before' | 'after';
  sourceStepId?: string;
  tiktokUrl?: string;
};

export type BatchImageEntry = {
  imageId?: string;
  imageUrl?: string;
  filename?: string;
  // First Frame Generation
  originalImageUrl?: string;     // Original model image URL (preserved for regeneration)
  originalImageId?: string;      // Original model image ID (preserved for regeneration)
  generatedOptions?: string[];   // GCS URLs of the 2 generated options (for UI display)
};

export type BatchVideoGenConfig = {
  mode: VideoGenMode;
  images: BatchImageEntry[];
  modelId?: string;
  prompt?: string;
  aspectRatio?: string;
  duration?: string;
  generateAudio?: boolean;
  negativePrompt?: string;
  resolution?: '720p' | '1080p' | '4k';
  maxSeconds?: number;
  // First Frame Generation (shared across all batch entries)
  firstFrameEnabled?: boolean;
  extractedFrameUrl?: string;    // Single extracted frame, used for all
  firstFrameResolution?: '1K' | '2K' | '4K';
  firstFrameProvider?: 'gemini' | 'fal' | 'gpt-image';
};

// Compose types
export type ComposeAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ComposeLayerFit = 'cover' | 'contain' | 'stretch';
export type LayerSourceType = 'step-output' | 'gallery-video' | 'gallery-image'
  | 'model-image' | 'upload' | 'url';

export type LayerSource = {
  type: LayerSourceType;
  url: string;
  gcsUrl?: string;
  stepId?: string;
  modelId?: string;
  label?: string;
};

export type ComposeLayer = {
  id: string;
  type: 'video' | 'image';
  source: LayerSource;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fit: ComposeLayerFit;
  borderRadius?: number;
  opacity?: number;
  trim?: { startSec: number; endSec: number };
};

export type ComposePresetId = '2up-vertical' | 'side-by-side' | 'pip'
  | 'grid-2x2' | '3-panel' | 'free-canvas';

export type ComposeConfig = {
  canvasWidth: number;
  canvasHeight: number;
  aspectRatio: ComposeAspectRatio;
  preset: ComposePresetId | null;
  backgroundColor: string;
  layers: ComposeLayer[];
};

export type MiniAppStep = {
  id: string;
  type: MiniAppType;
  config: VideoGenConfig | TextOverlayConfig | BgMusicConfig | AttachVideoConfig | BatchVideoGenConfig | ComposeConfig;
  enabled: boolean;
};

export type StepResult = {
  stepId: string;
  type: MiniAppType;
  label: string;
  outputUrl: string;
  signedUrl?: string;
};

export type TemplateJob = {
  id: string;
  name: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  step: string;
  pipeline: MiniAppStep[];
  videoSource: 'tiktok' | 'upload';
  tiktokUrl?: string;
  videoUrl?: string;
  outputUrl?: string;
  signedUrl?: string;
  stepResults?: StepResult[];
  pipelineBatchId?: string;
  modelId?: string;
  postStatus?: 'pending' | 'posted' | 'rejected' | null;
  regeneratedFrom?: string | null;
  captionOverride?: string | null;
  publishModeOverride?: 'now' | 'schedule' | 'queue' | 'draft' | null;
  scheduledForOverride?: string | null;
  timezoneOverride?: string | null;
  error?: string;
  createdBy?: string;
  createdAt: string;
  completedAt?: string;
};

export type PipelineBatch = {
  id: string;
  name: string;
  status: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  pipeline: MiniAppStep[];
  isMaster?: boolean;
  masterConfig?: MasterConfig;
  createdBy?: string;
  createdAt: string;
  completedAt?: string;
};

export type MusicTrack = {
  id: string;
  name: string;
  gcsUrl: string;
  signedUrl?: string;
  duration?: number;
  isDefault: boolean;
  createdAt: string;
};

export type TrendingTrack = {
  id: string;
  tiktokId: string;
  title: string;
  author?: string;
  album?: string;
  playUrl?: string;
  coverUrl?: string;
  duration?: number;
  gcsUrl?: string;
  fetchedAt?: string;
};

export type GeneratedImage = {
  id: string;
  gcsUrl: string;
  signedUrl?: string;
  filename: string;
  modelImageUrl?: string;
  sceneImageUrl?: string;
  promptVariant?: string;
  modelId?: string;
  createdBy?: string;
  createdAt: string;
};

export type ModelAccountMapping = {
  id: string;
  modelId: string;
  lateAccountId: string;
  platform: string;
  apiKeyIndex?: number;
  createdAt: string;
};

export type MasterConfigModel = {
  modelId: string;
  modelName: string;
  primaryImageUrl: string;
  accountIds: string[];
};

export type MasterConfig = {
  caption: string;
  scheduledFor?: string;
  timezone?: string;
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  models: MasterConfigModel[];
};

export type TemplatePreset = {
  id: string;
  name: string;
  description?: string;
  pipeline: MiniAppStep[];
  createdAt: string;
  updatedAt: string;
};

// ── Analytics types ──

export type AnalyticsAccount = {
  id: string;
  platform: string;
  username: string;
  accountId: string;
  displayName?: string;
  profileUrl?: string;
  lateAccountId?: string;
  followers: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number;
  lastSyncedAt?: string;
  mediaCount?: number;
  createdAt: string;
};

export type AnalyticsSnapshot = {
  date: string;
  followers: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number;
};

export type AnalyticsMediaItem = {
  id: string;
  accountId: string;
  platform: string;
  externalId: string;
  title?: string;
  caption?: string;
  url?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  accountUsername?: string;
  accountDisplayName?: string;
};

export type PostingActivityEntry = {
  date: string;
  posts: number;
  totalViews: number;
};

export type AnalyticsOverview = {
  totalFollowers: number;
  totalViews: number;
  totalInteractions: number;
  avgEngagementRate: number;
  accountCount: number;
  platformBreakdown: {
    platform: string;
    followers: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    accountCount: number;
  }[];
  postingActivity: PostingActivityEntry[];
  totalVideos: number;
  latestPost: {
    title: string | null;
    caption: string | null;
    url: string | null;
    publishedAt: string;
    platform: string;
    accountUsername: string;
  } | null;
  lastSyncedAt: string | null;
  history: AnalyticsSnapshot[];
};
