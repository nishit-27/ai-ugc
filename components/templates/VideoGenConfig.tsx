'use client';

import { useEffect, useState, useRef } from 'react';
import { useModels } from '@/hooks/useModels';
import { X, Clock, Monitor, Volume2, VolumeX, ChevronDown, ChevronUp, Check, RefreshCw, Sparkles, Upload, User } from 'lucide-react';
import type { VideoGenConfig as VGC, ModelImage } from '@/types';

type ImageSource = 'model' | 'upload';

type ExtractedFrame = {
  url: string;
  gcsUrl: string;
  score: number;
  hasFace: boolean;
  timestamp: number;
};

type FirstFrameOption = {
  url: string;
  gcsUrl: string;
};

// ── Module-level cache: survives unmount/remount when switching pipeline steps ──
type CachedStepState = {
  extractedFrames: ExtractedFrame[];
  firstFrameOptions: FirstFrameOption[];
  dismissedOptions: string[];
  imageSource: ImageSource;
  sceneDisplayUrl: string | null;
  originalModelImageUrl: string | null;
  uploadedGcsUrl: string | null;
  showImageGrid: boolean;
};
const _stepCache = new Map<string, CachedStepState>();

// Duration options per mode
const VEO_DURATIONS = ['4s', '6s', '8s'];

// Aspect ratio options
const VEO_ASPECTS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'auto', label: 'Auto' },
];

function Dropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]"
      >
        <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">{label}</span>
        <span>{selected?.label || value}</span>
        <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full z-50 mb-1 min-w-[120px] max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                opt.value === value
                  ? 'bg-[var(--accent)] font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--accent)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VideoGenConfig({
  config, onChange, sourceDuration, sourceVideoUrl, stepId,
}: {
  config: VGC;
  onChange: (c: VGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  stepId?: string;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Restore from module-level cache on mount
  const cached = stepId ? _stepCache.get(stepId) : undefined;

  const [imageSource, setImageSource] = useState<ImageSource>(
    () => cached?.imageSource ?? ((config.imageUrl && !config.imageId) ? 'upload' : 'model')
  );
  const [showImageGrid, setShowImageGrid] = useState(
    () => cached?.showImageGrid ?? !config.imageId
  );

  // First Frame state
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>(
    () => cached?.extractedFrames ?? []
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [firstFrameOptions, setFirstFrameOptionsRaw] = useState<FirstFrameOption[]>(
    () => cached?.firstFrameOptions ?? []
  );
  const [dismissedOptions, setDismissedOptions] = useState<Set<string>>(
    () => new Set(cached?.dismissedOptions ?? [])
  );
  const [isGeneratingFirstFrame, setIsGeneratingFirstFrame] = useState(false);

  // Helper: clear first frame options always resets dismissed set too
  const clearFirstFrameOptions = () => { setFirstFrameOptionsRaw([]); setDismissedOptions(new Set()); };
  const setFirstFrameOptions = (opts: FirstFrameOption[]) => { setFirstFrameOptionsRaw(opts); setDismissedOptions(new Set()); };
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [isUploadingScene, setIsUploadingScene] = useState(false);
  const [sceneDisplayUrl, setSceneDisplayUrl] = useState<string | null>(
    () => cached?.sceneDisplayUrl ?? null
  );
  const sceneFileRef = useRef<HTMLInputElement>(null);
  // Track the original model image URL so we can pass it to the API even after imageUrl is overwritten
  const originalModelImageUrlRef = useRef<string | null>(cached?.originalModelImageUrl ?? null);
  // Track the persistent GCS URL for uploaded model images (for API calls)
  const uploadedGcsUrlRef = useRef<string | null>(cached?.uploadedGcsUrl ?? null);

  // Persist transient UI state to module-level cache on unmount
  useEffect(() => {
    return () => {
      if (!stepId) return;
      _stepCache.set(stepId, {
        extractedFrames: extractedFramesRef.current,
        firstFrameOptions: firstFrameOptionsRef.current,
        dismissedOptions: Array.from(dismissedOptionsRef.current),
        imageSource: imageSourceRef.current,
        sceneDisplayUrl: sceneDisplayUrlRef.current,
        originalModelImageUrl: originalModelImageUrlRef.current,
        uploadedGcsUrl: uploadedGcsUrlRef.current,
        showImageGrid: showImageGridRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Refs that track latest values for the unmount save
  const extractedFramesRef = useRef(extractedFrames);
  extractedFramesRef.current = extractedFrames;
  const firstFrameOptionsRef = useRef(firstFrameOptions);
  firstFrameOptionsRef.current = firstFrameOptions;
  const dismissedOptionsRef = useRef(dismissedOptions);
  dismissedOptionsRef.current = dismissedOptions;
  const imageSourceRef = useRef(imageSource);
  imageSourceRef.current = imageSource;
  const sceneDisplayUrlRef = useRef(sceneDisplayUrl);
  sceneDisplayUrlRef.current = sceneDisplayUrl;
  const showImageGridRef = useRef(showImageGrid);
  showImageGridRef.current = showImageGrid;

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  // Resolve model image for display (prefers signedUrl for <img> tags)
  const resolveModelImageDisplay = (): string | null => {
    if (imageSource === 'model' && config.imageId) {
      const img = modelImages.find((m) => m.id === config.imageId);
      return img?.signedUrl || img?.gcsUrl || null;
    }
    if (imageSource === 'upload') {
      return originalModelImageUrlRef.current || config.imageUrl || null;
    }
    return null;
  };

  // Resolve model image for API calls (prefers gcsUrl — persistent, server will re-sign)
  const resolveModelImageUrl = (): string | null => {
    if (imageSource === 'model' && config.imageId) {
      const img = modelImages.find((m) => m.id === config.imageId);
      return img?.gcsUrl || img?.signedUrl || null;
    }
    if (imageSource === 'upload') {
      return originalModelImageUrlRef.current || uploadedGcsUrlRef.current || config.imageUrl || null;
    }
    return null;
  };

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    // Reset first frame state when changing image source
    clearFirstFrameOptions();
    setGenerateError(null);
    originalModelImageUrlRef.current = null;
    uploadedGcsUrlRef.current = null;
    if (src === 'upload') {
      onChange({ ...config, modelId: undefined, imageId: undefined, firstFrameEnabled: false, extractedFrameUrl: undefined });
    } else {
      onChange({ ...config, imageUrl: undefined, firstFrameEnabled: false, extractedFrameUrl: undefined });
    }
  };

  const handleExtractFrames = async () => {
    if (!sourceVideoUrl) return;
    setIsExtracting(true);
    setExtractError(null);
    setExtractedFrames([]);
    try {
      const res = await fetch('/api/extract-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: sourceVideoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract frames');
      setExtractedFrames(data.frames || []);
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : 'Failed to extract frames');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSceneUpload = async (file: File) => {
    setIsUploadingScene(true);
    setExtractError(null);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const persistentUrl = data.gcsUrl || data.url || data.path;  // GCS public URL (persistent)
        const displayUrl = data.url || data.path;                     // Signed URL (for <img> display)
        setSceneDisplayUrl(displayUrl);
        clearFirstFrameOptions();
        onChange({ ...config, extractedFrameUrl: persistentUrl });
      }
    } catch {
      setExtractError('Failed to upload scene image');
    } finally {
      setIsUploadingScene(false);
    }
  };

  const handleSceneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSceneUpload(file);
    e.target.value = '';
  };

  const handleSceneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('!border-[var(--primary)]/50', '!bg-[var(--primary)]/5');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleSceneUpload(file);
    }
  };

  const handleGenerateFirstFrame = async () => {
    const modelImageUrl = resolveModelImageUrl();
    if (!modelImageUrl || !config.extractedFrameUrl) return;

    // Preserve original model image URL before overwriting (prefer persistent GCS URL)
    if (!originalModelImageUrlRef.current) {
      originalModelImageUrlRef.current = imageSource === 'upload'
        ? (uploadedGcsUrlRef.current || config.imageUrl || null)
        : modelImageUrl;
    }

    setIsGeneratingFirstFrame(true);
    setGenerateError(null);
    clearFirstFrameOptions();

    try {
      const res = await fetch('/api/generate-first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelImageUrl, frameImageUrl: config.extractedFrameUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate first frame');
      setFirstFrameOptions(data.images || []);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to generate first frame');
    } finally {
      setIsGeneratingFirstFrame(false);
    }
  };

  const handleSelectFirstFrame = (option: FirstFrameOption) => {
    onChange({ ...config, imageUrl: option.gcsUrl });
  };

  const handleDismissOption = (option: FirstFrameOption) => {
    setDismissedOptions((prev) => new Set(prev).add(option.gcsUrl));
    // If the dismissed one was currently selected, deselect it
    if (config.imageUrl === option.gcsUrl) {
      const restored = originalModelImageUrlRef.current;
      onChange({ ...config, imageUrl: imageSource === 'upload' ? (restored || config.imageUrl) : undefined });
    }
  };

  const handleToggleFirstFrame = (enabled: boolean) => {
    if (!enabled) {
      // Restore original image when disabling
      const restored = originalModelImageUrlRef.current;
      clearFirstFrameOptions();
      setExtractedFrames([]);
      setGenerateError(null);
      originalModelImageUrlRef.current = null;
      onChange({
        ...config,
        firstFrameEnabled: false,
        extractedFrameUrl: undefined,
        // If we had overwritten imageUrl with a generated first frame, restore it
        imageUrl: imageSource === 'upload' ? (restored || config.imageUrl) : undefined,
      });
    } else {
      onChange({ ...config, firstFrameEnabled: true });
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        originalModelImageUrlRef.current = null;
        uploadedGcsUrlRef.current = data.gcsUrl || null;
        clearFirstFrameOptions();
        onChange({ ...config, imageUrl: data.url || data.path, modelId: undefined, imageId: undefined });
      }
    } catch {
      // handled silently
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  };

  const isMotion = config.mode === 'motion-control';
  const isSubtle = config.mode === 'subtle-animation';
  const audioOn = config.generateAudio ?? true;

  // Determine if a model image is selected (needed for first frame generate button)
  const hasModelImage = imageSource === 'model' ? !!config.imageId : !!config.imageUrl;

  return (
    <div className="space-y-5">
      {/* Mode */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Mode</label>
        <div className="flex gap-2">
          {(['motion-control', 'subtle-animation'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ ...config, mode })}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                config.mode === mode
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {mode === 'motion-control' ? 'Motion Control' : 'Subtle Animation'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          {isMotion ? 'Kling 2.6 — face swap onto input video' : 'Veo 3.1 — generates video from a single image'}
        </p>
      </div>

      {/* Image Source Toggle (no Extract — moved to First Frame section) */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Image (face reference)</label>
        <div className="flex gap-2">
          {([
            { key: 'model' as ImageSource, label: 'From Model' },
            { key: 'upload' as ImageSource, label: 'Upload Image' },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleImageSourceChange(opt.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                imageSource === opt.key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model + Image Picker */}
      {imageSource === 'model' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
            <select
              value={config.modelId || ''}
              onChange={(e) => {
                clearFirstFrameOptions();
                originalModelImageUrlRef.current = null;
                setShowImageGrid(true);
                onChange({ ...config, modelId: e.target.value, imageId: undefined, imageUrl: undefined });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
            >
              <option value="">Select a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {config.modelId && imagesLoading && modelImages.length === 0 && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-8">
              <div className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
              <span className="text-xs text-[var(--text-muted)]">Loading images...</span>
            </div>
          )}

          {config.modelId && modelImages.length > 0 && (
            <div>
              {/* Selected image preview + collapse toggle */}
              {config.imageId && !showImageGrid && (() => {
                const selectedImg = modelImages.find((m) => m.id === config.imageId);
                return selectedImg ? (
                  <button
                    onClick={() => setShowImageGrid(true)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 transition-colors hover:bg-[var(--accent)]"
                  >
                    <img src={selectedImg.signedUrl || selectedImg.gcsUrl} alt={selectedImg.filename} className="h-10 w-10 rounded-lg object-cover border border-[var(--primary)]" />
                    <div className="flex-1 text-left">
                      <p className="text-xs font-medium text-[var(--text)]">{selectedImg.filename}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Click to change</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  </button>
                ) : null;
              })()}

              {/* Image grid */}
              {(showImageGrid || !config.imageId) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Image</label>
                    {config.imageId && (
                      <button
                        onClick={() => setShowImageGrid(false)}
                        className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                      >
                        Collapse <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {modelImages.map((img: ModelImage) => (
                      <button
                        key={img.id}
                        onClick={() => {
                          clearFirstFrameOptions();
                          originalModelImageUrlRef.current = null;
                          setShowImageGrid(false);
                          onChange({ ...config, imageId: img.id, imageUrl: undefined });
                        }}
                        className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                          config.imageId === img.id
                            ? 'border-[var(--primary)] shadow-md'
                            : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                        }`}
                      >
                        <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                        {config.imageId === img.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="h-4 w-4 rounded-full border-2 border-white bg-[var(--primary)]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Direct Image Upload */}
      {imageSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Image</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

          {(originalModelImageUrlRef.current || config.imageUrl) && !config.firstFrameEnabled ? (
            <div className="relative">
              <img
                src={config.imageUrl || ''}
                alt="Uploaded"
                className="max-h-36 w-full rounded-xl border border-[var(--border)] object-contain bg-[var(--background)] p-1"
              />
              <button
                onClick={() => {
                  originalModelImageUrlRef.current = null;
                  clearFirstFrameOptions();
                  onChange({ ...config, imageUrl: undefined });
                }}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : !config.firstFrameEnabled ? (
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-colors ${
                isUploadingImage
                  ? 'border-[var(--accent-border)] bg-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
              }}
              onDrop={handleDrop}
            >
              {isUploadingImage ? (
                <>
                  <div className="h-8 w-8 rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)] animate-spin" />
                  <span className="mt-2 text-xs font-medium text-[var(--text-muted)]">Uploading…</span>
                </>
              ) : (
                <>
                  <span className="text-2xl text-[var(--text-muted)]">+</span>
                  <span className="mt-1 text-xs text-[var(--text-muted)]">Click or drag image here</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploadingImage} />
            </label>
          ) : (
            /* Show original image thumbnail when first frame is enabled */
            (originalModelImageUrlRef.current || config.imageUrl) && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
                <img
                  src={originalModelImageUrlRef.current || config.imageUrl || ''}
                  alt="Model face"
                  className="h-10 w-10 rounded object-cover"
                />
                <span className="text-xs text-[var(--text-muted)]">Face reference image</span>
              </div>
            )
          )}
        </div>
      )}

      {/* ─── First Frame Generator Card ─── */}
      {hasModelImage && (
        <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${
          config.firstFrameEnabled
            ? 'bg-gradient-to-b from-[var(--accent)] to-[var(--background)]'
            : 'bg-[var(--accent)]/50'
        }`}>
          {/* Header toggle */}
          <button
            onClick={() => handleToggleFirstFrame(!config.firstFrameEnabled)}
            className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--accent)]/60"
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
              config.firstFrameEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--background)]'
            }`}>
              <Sparkles className={`h-4 w-4 ${config.firstFrameEnabled ? 'text-[var(--primary-foreground)]' : 'text-[var(--text-muted)]'}`} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[13px] font-semibold text-[var(--text)]">First Frame</p>
              <p className="text-[10px] text-[var(--text-muted)] leading-tight">AI face swap onto a video scene</p>
            </div>
            <div className={`h-[22px] w-10 rounded-full p-0.5 transition-colors ${
              config.firstFrameEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--text-muted)]/20'
            }`}>
              <div className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                config.firstFrameEnabled ? 'translate-x-[18px]' : 'translate-x-0'
              }`} />
            </div>
          </button>

          {/* Body */}
          {config.firstFrameEnabled && (
            <div className="px-4 pb-4 space-y-3.5">
              {/* Two slots: Face + Scene */}
              <div className="grid grid-cols-2 gap-3">
                {/* Face slot (auto-filled from model image) */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Face</p>
                  {(() => {
                    const faceUrl = resolveModelImageDisplay();
                    return faceUrl ? (
                      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
                        <img src={faceUrl} alt="Face" className="h-full w-full object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2 pt-5">
                          <p className="text-[10px] font-medium text-white/80">Model image</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20">
                        <User className="h-5 w-5 text-[var(--text-muted)]/30" />
                        <p className="text-[10px] text-[var(--text-muted)]">Select above</p>
                      </div>
                    );
                  })()}
                </div>

                {/* Scene slot (extract + upload) */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Scene</p>
                  <input ref={sceneFileRef} type="file" accept="image/*" onChange={handleSceneFileChange} className="hidden" />

                  {config.extractedFrameUrl ? (
                    /* Selected scene — show thumbnail with change/clear */
                    <div className="relative w-full aspect-[3/4] overflow-hidden rounded-2xl group">
                      {(() => {
                        const selectedFrame = extractedFrames.find(f => f.gcsUrl === config.extractedFrameUrl);
                        const displayUrl = selectedFrame?.url || sceneDisplayUrl || config.extractedFrameUrl;
                        return <img src={displayUrl} alt="Scene" className="h-full w-full object-cover" />;
                      })()}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/0 group-hover:bg-black/40 transition-colors">
                        <button
                          onClick={() => setShowScenePicker(!showScenePicker)}
                          className="rounded-lg bg-white/20 px-3 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-opacity hover:bg-white/30"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => {
                            setSceneDisplayUrl(null);
                            clearFirstFrameOptions();
                            onChange({ ...config, extractedFrameUrl: undefined });
                          }}
                          className="text-[9px] text-white/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white/90"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2 pt-5">
                        <p className="text-[10px] font-medium text-white/80">Scene frame</p>
                      </div>
                    </div>
                  ) : isUploadingScene || isExtracting ? (
                    /* Loading state */
                    <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20">
                      <span className="h-5 w-5 rounded-full border-2 border-[var(--text-muted)]/20 border-t-[var(--primary)] animate-spin" />
                      <span className="text-[10px] text-[var(--text-muted)]">{isExtracting ? 'Extracting...' : 'Uploading...'}</span>
                    </div>
                  ) : (
                    /* Empty state — extract or upload */
                    <div
                      className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20 transition-all hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('!border-[var(--primary)]/40', '!bg-[var(--primary)]/5');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('!border-[var(--primary)]/40', '!bg-[var(--primary)]/5');
                      }}
                      onDrop={handleSceneDrop}
                      onClick={() => sceneFileRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-[var(--text-muted)]/30" />
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">Upload image</span>
                      {sourceVideoUrl && (
                        <>
                          <div className="w-8 border-t border-[var(--text-muted)]/15" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (extractedFrames.length > 0) {
                                setShowScenePicker(true);
                              } else {
                                handleExtractFrames();
                              }
                            }}
                            className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                          >
                            Extract from video
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Inline scene picker (frame grid) */}
              {showScenePicker && (extractedFrames.length > 0 || sourceVideoUrl) && (
                <div className="rounded-xl bg-[var(--background)] p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a scene frame</p>
                    <button onClick={() => setShowScenePicker(false)} className="rounded-md p-0.5 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {extractedFrames.length === 0 && sourceVideoUrl && (
                    <button
                      onClick={handleExtractFrames}
                      disabled={isExtracting}
                      className="w-full rounded-lg bg-[var(--accent)] px-2.5 py-2 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-border)]/30 disabled:opacity-50 transition-colors"
                    >
                      {isExtracting ? 'Extracting...' : 'Extract frames from video'}
                    </button>
                  )}
                  <div className="grid grid-cols-5 gap-1.5">
                    {extractedFrames.map((frame, i) => {
                      const isSel = config.extractedFrameUrl === frame.gcsUrl;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            onChange({ ...config, extractedFrameUrl: frame.gcsUrl });
                            clearFirstFrameOptions();
                            setShowScenePicker(false);
                          }}
                          className={`relative aspect-square overflow-hidden rounded-lg transition-all ${
                            isSel ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]' : 'hover:opacity-80'
                          }`}
                        >
                          <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
                          {frame.hasFace && (
                            <div className="absolute left-0.5 top-0.5 rounded-md bg-green-500/80 px-1 py-0.5 text-[7px] font-bold text-white">
                              {frame.score}
                            </div>
                          )}
                          {isSel && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      onClick={() => { handleExtractFrames(); }}
                      disabled={isExtracting}
                      className="flex-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                    >
                      {isExtracting ? 'Extracting...' : 'Re-extract'}
                    </button>
                    <span className="text-[10px] text-[var(--text-muted)]/30">|</span>
                    <button
                      onClick={() => { sceneFileRef.current?.click(); setShowScenePicker(false); }}
                      className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                    >
                      Upload instead
                    </button>
                  </div>
                </div>
              )}

              {/* Extract error */}
              {extractError && <p className="text-xs text-red-500">{extractError}</p>}

              {/* Scene picker for first time (no frame selected yet, frames loaded) */}
              {!config.extractedFrameUrl && extractedFrames.length > 0 && !showScenePicker && (
                <div className="rounded-xl bg-[var(--background)] p-2.5 space-y-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a scene frame</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {extractedFrames.map((frame, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onChange({ ...config, extractedFrameUrl: frame.gcsUrl });
                          clearFirstFrameOptions();
                        }}
                        className="relative aspect-square overflow-hidden rounded-lg hover:opacity-80 transition-all"
                      >
                        <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
                        {frame.hasFace && (
                          <div className="absolute left-0.5 top-0.5 rounded-md bg-green-500/80 px-1 py-0.5 text-[7px] font-bold text-white">
                            {frame.score}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate button */}
              {config.extractedFrameUrl && resolveModelImageUrl() && !isGeneratingFirstFrame && (
                <button
                  onClick={handleGenerateFirstFrame}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-semibold text-[var(--primary-foreground)] transition-all hover:bg-[var(--primary-hover)] active:scale-[0.98]"
                >
                  {firstFrameOptions.length > 0 ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate First Frame
                    </>
                  )}
                </button>
              )}

              {generateError && <p className="text-xs text-red-500">{generateError}</p>}

              {/* Skeleton loading while generating */}
              {isGeneratingFirstFrame && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">Generating options...</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((i) => (
                      <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--primary)]/10">
                        {/* Shimmer sweep */}
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[var(--primary)]/15 to-transparent" />
                        {/* Fake content skeleton lines */}
                        <div className="absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 px-4">
                          <div className="h-2 w-3/4 rounded-full bg-[var(--primary)]/10 animate-pulse" />
                          <div className="h-2 w-1/2 rounded-full bg-[var(--primary)]/8 animate-pulse [animation-delay:150ms]" />
                        </div>
                        {/* Letter badge */}
                        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[9px] font-bold text-[var(--text-muted)]">
                          {String.fromCharCode(65 + i)}
                        </div>
                        {/* Bottom spinner */}
                        <div className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-1.5 pb-4 pt-6 bg-gradient-to-t from-[var(--primary)]/8 to-transparent">
                          <span className="h-4 w-4 rounded-full border-2 border-[var(--primary)]/15 border-t-[var(--primary)] animate-spin" />
                          <span className="text-[9px] font-medium text-[var(--text-muted)]">{i === 0 ? 'Option A' : 'Option B'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated results */}
              {!isGeneratingFirstFrame && firstFrameOptions.length > 0 && (() => {
                const visibleOptions = firstFrameOptions.filter((o) => !dismissedOptions.has(o.gcsUrl));
                const allDismissed = visibleOptions.length === 0;

                return allDismissed ? (
                  /* All options dismissed */
                  <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/15 py-6">
                    <p className="text-xs text-[var(--text-muted)]">All options dismissed</p>
                    <button
                      onClick={handleGenerateFirstFrame}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--primary-foreground)] transition-all hover:bg-[var(--primary-hover)] active:scale-[0.98]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a result</p>
                    <div className="grid grid-cols-2 gap-3">
                      {firstFrameOptions.map((opt, i) => {
                        if (dismissedOptions.has(opt.gcsUrl)) return null;
                        const isSelected = config.imageUrl === opt.gcsUrl;
                        return (
                          <div key={i} className="relative">
                            <button
                              onClick={() => handleSelectFirstFrame(opt)}
                              className={`relative w-full aspect-[3/4] overflow-hidden rounded-2xl border-2 transition-all duration-150 ${
                                isSelected
                                  ? 'border-[var(--primary)]'
                                  : 'border-transparent hover:opacity-90'
                              }`}
                            >
                              <img src={opt.url} alt={`Option ${String.fromCharCode(65 + i)}`} className="h-full w-full object-cover" />
                              <div className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[9px] font-bold text-white backdrop-blur-sm">
                                {String.fromCharCode(65 + i)}
                              </div>
                              {isSelected && (
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[var(--primary)]/90 to-transparent py-1 text-center">
                                  <span className="text-[10px] font-semibold text-[var(--primary-foreground)]">Selected</span>
                                </div>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Prompt</label>
        <textarea
          value={config.prompt || ''}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Describe the motion…"
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
        />
      </div>

      {/* ─── Toolbar ─── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--accent)] px-3 py-2.5">

          {/* Duration slider (motion) / dropdown (veo) */}
          {isMotion && (() => {
            const maxVal = sourceDuration || 30;
            const currentVal = config.maxSeconds || sourceDuration || 10;
            return (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">Duration</span>
                <input
                  type="range"
                  min={5}
                  max={maxVal}
                  step={1}
                  value={Math.min(currentVal, maxVal)}
                  onChange={(e) => onChange({ ...config, maxSeconds: parseInt(e.target.value) })}
                  className="h-1.5 w-24 cursor-pointer accent-[var(--primary)]"
                />
                <span className="min-w-[2.5rem] text-xs font-medium tabular-nums">{Math.min(currentVal, maxVal)}s</span>
              </div>
            );
          })()}
          {isSubtle && (
            <Dropdown
              icon={Clock}
              label="Duration"
              value={config.duration || '4s'}
              options={VEO_DURATIONS.map((d) => ({ value: d, label: d }))}
              onChange={(v) => onChange({ ...config, duration: v })}
            />
          )}

          <div className="h-5 w-px bg-[var(--border)]" />

          {/* Aspect Ratio — Veo only (motion control follows input video) */}
          {isSubtle && (
            <>
              <Dropdown
                icon={Monitor}
                label="Aspect"
                value={config.aspectRatio || '9:16'}
                options={VEO_ASPECTS}
                onChange={(v) => onChange({ ...config, aspectRatio: v })}
              />
              <div className="h-5 w-px bg-[var(--border)]" />
            </>
          )}

          {/* Resolution — Veo only */}
          {isSubtle && (
            <>
              <Dropdown
                icon={Monitor}
                label="Res"
                value={config.resolution || '720p'}
                options={[
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                  { value: '4k', label: '4K' },
                ]}
                onChange={(v) => onChange({ ...config, resolution: v as '720p' | '1080p' | '4k' })}
              />
              <div className="h-5 w-px bg-[var(--border)]" />
            </>
          )}

          {/* Audio toggle pill */}
          <button
            onClick={() => onChange({ ...config, generateAudio: !audioOn })}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
              audioOn
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]'
            }`}
          >
            {audioOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Audio
          </button>

        </div>
      </div>
    </div>
  );
}
