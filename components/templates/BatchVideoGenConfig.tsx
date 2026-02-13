'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useModels } from '@/hooks/useModels';
import { X, Clock, Monitor, Volume2, VolumeX, ChevronDown, Check, RefreshCw } from 'lucide-react';
import type { BatchVideoGenConfig as BVGC, BatchImageEntry, ModelImage } from '@/types';

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

const VEO_DURATIONS = ['4s', '6s', '8s'];
const VEO_ASPECTS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'auto', label: 'Auto' },
];

const CONCURRENCY_LIMIT = 3;

// ── Module-level cache: survives unmount/remount when switching pipeline steps ──
type BatchCachedStepState = {
  extractedFrames: ExtractedFrame[];
  firstFrameResults: [number, FirstFrameOption[]][];
  imageSource: ImageSource;
};
const _batchStepCache = new Map<string, BatchCachedStepState>();

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

export default function BatchVideoGenConfig({
  config, onChange, sourceDuration, sourceVideoUrl, stepId,
}: {
  config: BVGC;
  onChange: (c: BVGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  stepId?: string;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Restore from module-level cache on mount
  const bCached = stepId ? _batchStepCache.get(stepId) : undefined;

  const [imageSource, setImageSource] = useState<ImageSource>(
    () => bCached?.imageSource ?? ((config.images.length > 0 && config.images.some(i => i.imageUrl && !i.imageId)) ? 'upload' : 'model')
  );

  // First Frame state
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>(
    () => bCached?.extractedFrames ?? []
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [firstFrameResults, setFirstFrameResults] = useState<Map<number, FirstFrameOption[]>>(
    () => new Map(bCached?.firstFrameResults ?? [])
  );
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState({ done: 0, total: 0 });

  // Refs that track latest values for the unmount save
  const extractedFramesRef = useRef(extractedFrames);
  extractedFramesRef.current = extractedFrames;
  const firstFrameResultsRef = useRef(firstFrameResults);
  firstFrameResultsRef.current = firstFrameResults;
  const imageSourceRef = useRef(imageSource);
  imageSourceRef.current = imageSource;

  // Persist transient UI state to module-level cache on unmount
  useEffect(() => {
    return () => {
      if (!stepId) return;
      _batchStepCache.set(stepId, {
        extractedFrames: extractedFramesRef.current,
        firstFrameResults: Array.from(firstFrameResultsRef.current.entries()),
        imageSource: imageSourceRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  // Resolve model image URL for API calls (prefers gcsUrl — persistent, server will re-sign)
  const resolveEntryImageUrl = useCallback((entry: BatchImageEntry): string | null => {
    // If we preserved the original, use it
    if (entry.originalImageUrl) return entry.originalImageUrl;
    if (entry.originalImageId) {
      const img = modelImages.find((m) => m.id === entry.originalImageId);
      return img?.gcsUrl || img?.signedUrl || null;
    }
    // Otherwise use the current image ref
    if (entry.imageId) {
      const img = modelImages.find((m) => m.id === entry.imageId);
      return img?.gcsUrl || img?.signedUrl || null;
    }
    if (entry.imageUrl) return entry.imageUrl;
    return null;
  }, [modelImages]);

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    setFirstFrameResults(new Map());
    setGeneratingIndices(new Set());
    onChange({
      ...config,
      images: [],
      modelId: src === 'upload' ? undefined : config.modelId,
      firstFrameEnabled: false,
      extractedFrameUrl: undefined,
    });
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

  const isImageSelected = (imgId: string) => config.images.some(i => i.imageId === imgId);

  const toggleModelImage = (img: ModelImage) => {
    if (isImageSelected(img.id)) {
      const idx = config.images.findIndex(i => i.imageId === img.id);
      const newResults = new Map(firstFrameResults);
      newResults.delete(idx);
      setFirstFrameResults(newResults);
      onChange({ ...config, images: config.images.filter(i => i.imageId !== img.id) });
    } else {
      onChange({ ...config, images: [...config.images, { imageId: img.id, filename: img.filename }] });
    }
  };

  const handleImageUpload = async (files: FileList) => {
    setIsUploadingImage(true);
    const newImages: BatchImageEntry[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          newImages.push({ imageUrl: data.url || data.path, filename: file.name });
        }
      } catch {
        // skip failed uploads
      }
    }
    if (newImages.length > 0) {
      onChange({ ...config, images: [...config.images, ...newImages], modelId: undefined });
    }
    setIsUploadingImage(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleImageUpload(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        const dt = new DataTransfer();
        imageFiles.forEach(f => dt.items.add(f));
        handleImageUpload(dt.files);
      }
    }
  };

  const removeImage = (index: number) => {
    const newResults = new Map(firstFrameResults);
    newResults.delete(index);
    // Re-key results for indices after the removed one
    const reKeyed = new Map<number, FirstFrameOption[]>();
    newResults.forEach((val, key) => {
      reKeyed.set(key > index ? key - 1 : key, val);
    });
    setFirstFrameResults(reKeyed);
    onChange({ ...config, images: config.images.filter((_, i) => i !== index) });
  };

  // Generate first frame for a single image entry
  const generateFirstFrameForIndex = async (index: number, images: BatchImageEntry[]): Promise<FirstFrameOption[] | null> => {
    const entry = images[index];
    const modelImageUrl = resolveEntryImageUrl(entry);
    if (!modelImageUrl || !config.extractedFrameUrl) return null;

    setGeneratingIndices((prev) => new Set(prev).add(index));

    try {
      const res = await fetch('/api/generate-first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelImageUrl, frameImageUrl: config.extractedFrameUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');

      const options: FirstFrameOption[] = data.images || [];
      setFirstFrameResults((prev) => new Map(prev).set(index, options));

      // Preserve original image ref
      const newImages = [...images];
      if (!newImages[index].originalImageId && newImages[index].imageId) {
        newImages[index] = { ...newImages[index], originalImageId: newImages[index].imageId };
      }
      if (!newImages[index].originalImageUrl && newImages[index].imageUrl) {
        newImages[index] = { ...newImages[index], originalImageUrl: newImages[index].imageUrl };
      }
      newImages[index] = { ...newImages[index], generatedOptions: options.map(o => o.gcsUrl) };
      onChange({ ...config, images: newImages });

      return options;
    } catch (e) {
      console.error(`Generate first frame for index ${index} failed:`, e);
      return null;
    } finally {
      setGeneratingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  // Generate all first frames with concurrency limit
  const handleGenerateAll = async () => {
    if (!config.extractedFrameUrl) return;
    setIsGeneratingAll(true);
    const total = config.images.length;
    setGenerateAllProgress({ done: 0, total });

    const indices = Array.from({ length: total }, (_, i) => i);
    let done = 0;

    // Process in batches of CONCURRENCY_LIMIT
    for (let i = 0; i < indices.length; i += CONCURRENCY_LIMIT) {
      const batch = indices.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map((idx) => generateFirstFrameForIndex(idx, config.images)));
      done += batch.length;
      setGenerateAllProgress({ done: Math.min(done, total), total });
    }

    setIsGeneratingAll(false);
  };

  const handleSelectFirstFrameForIndex = (index: number, option: FirstFrameOption) => {
    const newImages = [...config.images];
    // Preserve originals if not already saved
    if (!newImages[index].originalImageId && newImages[index].imageId) {
      newImages[index] = { ...newImages[index], originalImageId: newImages[index].imageId };
    }
    if (!newImages[index].originalImageUrl && newImages[index].imageUrl) {
      newImages[index] = { ...newImages[index], originalImageUrl: newImages[index].imageUrl };
    }
    newImages[index] = { ...newImages[index], imageUrl: option.gcsUrl };
    onChange({ ...config, images: newImages });
  };

  const handleToggleFirstFrame = (enabled: boolean) => {
    if (!enabled) {
      // Restore original images
      const restoredImages = config.images.map((img) => {
        if (img.originalImageId || img.originalImageUrl) {
          return {
            imageId: img.originalImageId || img.imageId,
            imageUrl: img.originalImageUrl || img.imageUrl,
            filename: img.filename,
          };
        }
        return { imageId: img.imageId, imageUrl: img.imageUrl, filename: img.filename };
      });
      setFirstFrameResults(new Map());
      setExtractedFrames([]);
      onChange({
        ...config,
        firstFrameEnabled: false,
        extractedFrameUrl: undefined,
        images: restoredImages,
      });
    } else {
      onChange({ ...config, firstFrameEnabled: true });
    }
  };

  const isMotion = config.mode === 'motion-control';
  const isSubtle = config.mode === 'subtle-animation';
  const audioOn = config.generateAudio ?? true;

  // Get display URL for an image entry (show original when first frame section is visible)
  const getEntryDisplayUrl = (entry: BatchImageEntry): string => {
    // For display in the per-image generation cards, show the original
    const origUrl = entry.originalImageUrl || entry.imageUrl;
    if (origUrl) return origUrl;
    const origId = entry.originalImageId || entry.imageId;
    if (origId) {
      const img = modelImages.find(m => m.id === origId);
      return img?.signedUrl || img?.gcsUrl || '';
    }
    return '';
  };

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
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Images</label>
        <div className="flex gap-2">
          {([
            { key: 'model' as ImageSource, label: 'From Model' },
            { key: 'upload' as ImageSource, label: 'Upload Images' },
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

      {/* Model + Multi-Image Picker */}
      {imageSource === 'model' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
            <select
              value={config.modelId || ''}
              onChange={(e) => {
                setFirstFrameResults(new Map());
                onChange({ ...config, modelId: e.target.value, images: [] });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
            >
              <option value="">Select a model...</option>
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
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Select Images
                {config.images.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-white">
                    {config.images.length}
                  </span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {modelImages.map((img: ModelImage) => {
                  const selected = isImageSelected(img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggleModelImage(img)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                        selected
                          ? 'border-[var(--primary)] shadow-md'
                          : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                      }`}
                    >
                      <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                      {selected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                Click images to select/deselect. Each image = one pipeline run.
              </p>
            </div>
          )}
        </>
      )}

      {/* Direct Image Upload (multiple) */}
      {imageSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
            Upload Images
            {config.images.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-white">
                {config.images.length}
              </span>
            )}
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />

          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors ${
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
                <span className="mt-2 text-xs font-medium text-[var(--text-muted)]">Uploading...</span>
              </>
            ) : (
              <>
                <span className="text-2xl text-[var(--text-muted)]">+</span>
                <span className="mt-1 text-xs text-[var(--text-muted)]">Click or drag multiple images here</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={isUploadingImage} />
          </label>
        </div>
      )}

      {/* Selected Images Strip */}
      {config.images.length > 0 && !config.firstFrameEnabled && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
            Selected ({config.images.length} image{config.images.length !== 1 ? 's' : ''} = {config.images.length} pipeline run{config.images.length !== 1 ? 's' : ''})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {config.images.map((img, i) => (
              <div key={i} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                {(img.imageUrl || img.imageId) && (
                  <img
                    src={img.imageUrl || modelImages.find(m => m.id === img.imageId)?.signedUrl || modelImages.find(m => m.id === img.imageId)?.gcsUrl || ''}
                    alt={img.filename || `Image ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  onClick={() => removeImage(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white transition-colors hover:bg-black/70"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Generate First Frames (optional) ─── */}
      {config.images.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.firstFrameEnabled || false}
              onChange={(e) => handleToggleFirstFrame(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--primary)]"
            />
            <span className="text-xs font-medium text-[var(--text)]">Generate First Frames</span>
            <span className="text-[10px] text-[var(--text-muted)]">AI face swap per model image</span>
          </label>

          {config.firstFrameEnabled && (
            <div className="space-y-3 pl-5">
              {/* Step 1: Extract shared frame */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">1. Pick a scene frame (shared for all)</label>
                {!sourceVideoUrl ? (
                  <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border)] py-4">
                    <span className="text-xs text-[var(--text-muted)]">Set a source video first</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={handleExtractFrames}
                      disabled={isExtracting}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--border)] disabled:opacity-50"
                    >
                      {isExtracting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-3 w-3 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--text)] animate-spin" />
                          Extracting frames...
                        </span>
                      ) : (
                        extractedFrames.length > 0 ? 'Re-extract Frames' : 'Extract Frames'
                      )}
                    </button>
                    {extractError && <p className="text-xs text-red-500">{extractError}</p>}
                    {extractedFrames.length > 0 && (
                      <div className="grid grid-cols-4 gap-1">
                        {extractedFrames.map((frame, i) => {
                          const isSelected = config.extractedFrameUrl === frame.gcsUrl;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setFirstFrameResults(new Map()); // Reset all generated options when frame changes
                                onChange({ ...config, extractedFrameUrl: frame.gcsUrl });
                              }}
                              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                                isSelected
                                  ? 'border-[var(--primary)] shadow-md'
                                  : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                              }`}
                            >
                              <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover" />
                              <div className={`absolute left-0.5 top-0.5 rounded px-0.5 py-0 text-[9px] font-bold ${
                                frame.hasFace ? 'bg-green-500/90 text-white' : 'bg-gray-500/70 text-white'
                              }`}>
                                {frame.hasFace ? `${frame.score}/10` : 'No face'}
                              </div>
                              {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                                    <Check className="h-2.5 w-2.5 text-white" />
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Per-image generation */}
              {config.extractedFrameUrl && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">2. Generate per image</label>
                    <button
                      onClick={handleGenerateAll}
                      disabled={isGeneratingAll || generatingIndices.size > 0}
                      className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {isGeneratingAll ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          {generateAllProgress.done}/{generateAllProgress.total}
                        </span>
                      ) : (
                        'Generate All'
                      )}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {config.images.map((entry, idx) => {
                      const isGenerating = generatingIndices.has(idx);
                      const options = firstFrameResults.get(idx) || [];
                      const displayUrl = getEntryDisplayUrl(entry);
                      const selectedGcsUrl = options.find(o => o.gcsUrl === entry.imageUrl)?.gcsUrl;

                      return (
                        <div key={idx} className="rounded-lg border border-[var(--border)] p-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <img
                              src={displayUrl}
                              alt={entry.filename || `Image ${idx + 1}`}
                              className="h-9 w-9 rounded object-cover shrink-0"
                            />
                            <span className="text-xs text-[var(--text)] truncate flex-1">
                              {entry.filename || `Image ${idx + 1}`}
                            </span>
                            {options.length === 0 && !isGenerating && (
                              <button
                                onClick={() => generateFirstFrameForIndex(idx, config.images)}
                                disabled={generatingIndices.size > 0 || isGeneratingAll}
                                className="rounded bg-[var(--primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90 disabled:opacity-50 shrink-0"
                              >
                                Generate
                              </button>
                            )}
                            {isGenerating && (
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin shrink-0" />
                            )}
                            {options.length > 0 && !isGenerating && (
                              <button
                                onClick={() => generateFirstFrameForIndex(idx, config.images)}
                                disabled={generatingIndices.size > 0 || isGeneratingAll}
                                className="flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50 shrink-0"
                              >
                                <RefreshCw className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>

                          {/* Generated options for this image */}
                          {options.length > 0 && (
                            <div className="grid grid-cols-2 gap-1">
                              {options.map((opt, oi) => {
                                const isSelected = entry.imageUrl === opt.gcsUrl;
                                return (
                                  <button
                                    key={oi}
                                    onClick={() => handleSelectFirstFrameForIndex(idx, opt)}
                                    className={`relative aspect-[4/3] overflow-hidden rounded border-2 transition-all duration-150 ${
                                      isSelected
                                        ? 'border-[var(--primary)] shadow-sm'
                                        : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                                    }`}
                                  >
                                    <img src={opt.url} alt={`Option ${String.fromCharCode(65 + oi)}`} className="h-full w-full object-cover" />
                                    {isSelected && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                                          <Check className="h-2.5 w-2.5 text-white" />
                                        </div>
                                      </div>
                                    )}
                                    <div className="absolute right-0.5 top-0.5 rounded bg-black/50 px-0.5 py-0 text-[8px] font-bold text-white">
                                      {String.fromCharCode(65 + oi)}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {selectedGcsUrl && (
                            <p className="text-[10px] text-green-600 font-medium">Selected</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
          placeholder="Describe the motion..."
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
        />
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--accent)] px-3 py-2.5">

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
