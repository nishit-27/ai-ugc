import { useEffect } from 'react';
import type { CachedStepState, FirstFrameInputMode, FirstFrameOption, ImageSource, ExtractedFrame } from './types';

const STORAGE_KEY = 'ai-ugc-videogen-step-cache';

// Hydrate in-memory cache from sessionStorage on module load
function hydrateFromStorage(): Map<string, CachedStepState> {
  const map = new Map<string, CachedStepState>();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CachedStepState>;
      for (const [key, value] of Object.entries(parsed)) {
        map.set(key, value);
      }
    }
  } catch { /* ignore parse errors */ }
  return map;
}

function persistToStorage(map: Map<string, CachedStepState>) {
  try {
    const obj: Record<string, CachedStepState> = {};
    for (const [key, value] of map) {
      obj[key] = value;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* storage full or unavailable */ }
}

export const videoGenStepCache: Map<string, CachedStepState> =
  typeof window !== 'undefined' ? hydrateFromStorage() : new Map();

type Params = {
  stepId?: string;
  extractedFrames: ExtractedFrame[];
  firstFrameOptions: FirstFrameOption[];
  dismissedOptions: Set<string>;
  imageSource: ImageSource;
  sceneDisplayUrl: string | null;
  showImageGrid: boolean;
  firstFrameInputMode: FirstFrameInputMode;
  selectedFirstFrameDisplayUrl: string | null;
  masterPerModelResults: Record<string, FirstFrameOption[]>;
  masterAutoExtracted: boolean;
  originalModelImageUrlRef: React.MutableRefObject<string | null>;
  uploadedGcsUrlRef: React.MutableRefObject<string | null>;
};

export function useVideoGenStepCache({
  stepId,
  extractedFrames,
  firstFrameOptions,
  dismissedOptions,
  imageSource,
  sceneDisplayUrl,
  showImageGrid,
  firstFrameInputMode,
  selectedFirstFrameDisplayUrl,
  masterPerModelResults,
  masterAutoExtracted,
  originalModelImageUrlRef,
  uploadedGcsUrlRef,
}: Params) {
  useEffect(() => {
    if (!stepId) return;
    const state: CachedStepState = {
      extractedFrames,
      firstFrameOptions,
      dismissedOptions: Array.from(dismissedOptions),
      imageSource,
      sceneDisplayUrl,
      originalModelImageUrl: originalModelImageUrlRef.current,
      uploadedGcsUrl: uploadedGcsUrlRef.current,
      showImageGrid,
      firstFrameInputMode,
      selectedFirstFrameDisplayUrl,
      masterPerModelResults,
      masterAutoExtracted,
    };
    videoGenStepCache.set(stepId, state);
    persistToStorage(videoGenStepCache);
  }, [
    stepId,
    extractedFrames,
    firstFrameOptions,
    dismissedOptions,
    imageSource,
    sceneDisplayUrl,
    showImageGrid,
    firstFrameInputMode,
    selectedFirstFrameDisplayUrl,
    masterPerModelResults,
    masterAutoExtracted,
    originalModelImageUrlRef,
    uploadedGcsUrlRef,
  ]);
}
