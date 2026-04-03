export type ImageSource = 'model' | 'upload';
export type FirstFrameInputMode = 'generate' | 'direct-library';

export type ExtractedFrame = {
  url: string;
  gcsUrl: string;
  score: number;
  hasFace: boolean;
  timestamp: number;
};

export type FirstFrameOption = {
  url: string;
  gcsUrl: string;
  reviewStatus?: 'match' | 'mismatch' | 'unknown';
  reviewLabel?: string | null;
  reviewReason?: string | null;
  reviewConfidence?: number | null;
};

export type CachedStepState = {
  extractedFrames: ExtractedFrame[];
  firstFrameOptions: FirstFrameOption[];
  allowedMismatchUrls: string[];
  dismissedOptions: string[];
  imageSource: ImageSource;
  sceneDisplayUrl: string | null;
  originalModelImageUrl: string | null;
  uploadedGcsUrl: string | null;
  showImageGrid: boolean;
  firstFrameInputMode: FirstFrameInputMode;
  selectedFirstFrameDisplayUrl: string | null;
  masterPerModelResults: Record<string, FirstFrameOption[]>;
  masterAutoExtracted: boolean;
};

export type MasterPerModelActivePanel = 'upload' | 'model-images' | null;

export type QueueModelStatus = 'queued' | 'generating' | 'done' | 'failed';
export type QueueState = Record<string, { status: QueueModelStatus; position?: number }>;

export const VEO_DURATIONS = ['4s', '6s', '8s'];

export const VEO_ASPECTS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'auto', label: 'Auto' },
];
