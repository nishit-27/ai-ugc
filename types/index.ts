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
  createdAt: string;
};

export type Post = {
  _id: string;
  content?: string;
  scheduledFor?: string;
  createdAt?: string;
  mediaItems?: { url?: string; thumbnailUrl?: string }[];
  platforms?: { platform: string; status?: string; platformPostUrl?: string }[];
};

export type Profile = {
  _id: string;
  name: string;
  description?: string;
  color?: string;
};

export type Account = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  createdAt?: string;
  profileId?: { _id: string } | string;
};

export type Model = {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  imageCount?: number;
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

export type MiniAppType = 'video-generation' | 'batch-video-generation' | 'text-overlay' | 'bg-music' | 'attach-video';

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
};

export type MiniAppStep = {
  id: string;
  type: MiniAppType;
  config: VideoGenConfig | TextOverlayConfig | BgMusicConfig | AttachVideoConfig | BatchVideoGenConfig;
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
  error?: string;
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

export type GeneratedImage = {
  id: string;
  gcsUrl: string;
  signedUrl?: string;
  filename: string;
  modelImageUrl?: string;
  sceneImageUrl?: string;
  promptVariant?: string;
  createdAt: string;
};

export type TemplatePreset = {
  id: string;
  name: string;
  description?: string;
  pipeline: MiniAppStep[];
  createdAt: string;
  updatedAt: string;
};
