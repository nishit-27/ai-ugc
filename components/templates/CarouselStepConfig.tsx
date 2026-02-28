'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModels } from '@/hooks/useModels';
import { useGeneratedImages } from '@/hooks/useGeneratedImages';
import PreviewModal from '@/components/ui/PreviewModal';
import {
  Upload, X, GripVertical, Check, ImageIcon, Loader2, ChevronDown,
  Sparkles, RefreshCw, Expand,
} from 'lucide-react';
import type { CarouselImageEntry, CarouselConfig as CC, ModelImage, GeneratedImage } from '@/types';

type ImageSource = 'model' | 'upload' | 'generate';

const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 10,
  tiktok: 35,
  both: 10,
};

type SceneImage = { url: string; filename: string };
type GenResult = { id?: string; url: string; gcsUrl: string };

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function CarouselStepConfig({
  config,
  onChange,
  stepId,
  masterMode,
  isExpanded,
}: {
  config: CC;
  onChange: (c: CC) => void;
  stepId?: string;
  masterMode?: boolean;
  isExpanded?: boolean;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>(() => {
    if (config.sceneImageUrls?.length) return 'generate';
    if (config.images.length > 0 && config.images.some((img) => img.imageUrl && !img.imageId)) return 'upload';
    // In master mode, default to generate since model gallery is per-model at run time
    return masterMode ? 'generate' : 'model';
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Generate mode state
  const [sceneImages, setSceneImages] = useState<SceneImage[]>(() =>
    (config.sceneImageUrls || []).map((url, i) => ({ url, filename: `Scene ${i + 1}` })),
  );
  const [isUploadingScene, setIsUploadingScene] = useState(false);
  const [genProvider, setGenProvider] = useState(config.generateProvider || 'gpt-image');
  const [genResolution, setGenResolution] = useState(config.generateResolution || '1K');
  const [genVariantsPerScene, setGenVariantsPerScene] = useState(config.generateCount || 1);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(new Set());
  const [genResults, setGenResults] = useState<Map<number, GenResult[]>>(new Map());
  const [genError, setGenError] = useState<string | null>(null);

  // Library browser
  const {
    images: libraryImages,
    isLoadingPage: libraryLoading,
    refresh: refreshLibrary,
    page: libraryPage,
    setPage: setLibraryPage,
    totalPages: libraryTotalPages,
    total: libraryTotal,
  } = useGeneratedImages({
    modelId: imageSource === 'generate' ? (config.modelId || undefined) : undefined,
  });

  const platform = config.targetPlatform || 'instagram';
  const maxImages = PLATFORM_LIMITS[platform] || 10;

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    if (src !== 'generate') {
      onChange({
        ...config,
        images: [],
        modelId: src === 'upload' ? undefined : config.modelId,
      });
    } else {
      onChange({ ...config, images: [] });
    }
  };

  const isImageSelected = (imgId: string) => config.images.some((img) => img.imageId === imgId);
  const isImageUrlSelected = (url: string) => config.images.some((img) => img.imageUrl === url);

  const toggleModelImage = (img: ModelImage) => {
    if (isImageSelected(img.id)) {
      onChange({ ...config, images: config.images.filter((entry) => entry.imageId !== img.id) });
      return;
    }
    if (config.images.length >= maxImages) return;
    onChange({ ...config, images: [...config.images, { imageId: img.id, imageUrl: img.gcsUrl || img.signedUrl, filename: img.filename }] });
  };

  const toggleGeneratedImage = (img: GeneratedImage) => {
    const url = img.signedUrl || img.gcsUrl;
    if (isImageSelected(img.id) || isImageUrlSelected(url)) {
      onChange({ ...config, images: config.images.filter((entry) => entry.imageId !== img.id && entry.imageUrl !== url) });
      return;
    }
    if (config.images.length >= maxImages) return;
    onChange({ ...config, images: [...config.images, { imageId: img.id, imageUrl: url, filename: img.filename }] });
  };

  const toggleGenResult = (result: GenResult) => {
    const url = result.url || result.gcsUrl;
    if (isImageUrlSelected(url) || (result.id && isImageSelected(result.id))) {
      onChange({ ...config, images: config.images.filter((e) => e.imageUrl !== url && e.imageId !== result.id) });
      return;
    }
    if (config.images.length >= maxImages) return;
    onChange({
      ...config,
      images: [...config.images, { imageId: result.id, imageUrl: url, filename: url.split('/').pop() || 'generated.jpg' }],
    });
  };

  // Upload images (model gallery upload mode)
  const handleImageUpload = async (files: FileList) => {
    setIsUploadingImage(true);
    const newImages: CarouselImageEntry[] = [];
    for (const file of Array.from(files)) {
      if (config.images.length + newImages.length >= maxImages) break;
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) newImages.push({ imageUrl: data.url || data.path, filename: file.name });
      } catch {}
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
    if (files.length === 0) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const dt = new DataTransfer();
    imageFiles.forEach((file) => dt.items.add(file));
    handleImageUpload(dt.files);
  };

  // Scene image upload (for generate mode)
  const handleSceneUpload = async (files: FileList) => {
    setIsUploadingScene(true);
    const newScenes: SceneImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) newScenes.push({ url: data.url || data.path, filename: file.name });
      } catch {}
    }
    if (newScenes.length > 0) {
      const updated = [...sceneImages, ...newScenes];
      setSceneImages(updated);
      onChange({ ...config, sceneImageUrls: updated.map((s) => s.url) });
    }
    setIsUploadingScene(false);
  };

  const handleSceneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleSceneUpload(files);
    e.target.value = '';
  };

  const handleSceneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const dt = new DataTransfer();
    imageFiles.forEach((f) => dt.items.add(f));
    handleSceneUpload(dt.files);
  };

  const removeScene = (index: number) => {
    const updated = sceneImages.filter((_, i) => i !== index);
    setSceneImages(updated);
    onChange({ ...config, sceneImageUrls: updated.map((s) => s.url) });
    setGenResults((prev) => {
      const next = new Map<number, GenResult[]>();
      for (const [k, v] of prev) {
        if (k < index) next.set(k, v);
        else if (k > index) next.set(k - 1, v);
      }
      return next;
    });
  };

  // Generate for one scene
  const generateForScene = async (sceneIndex: number) => {
    const model = models.find((m) => m.id === config.modelId);
    const primaryImage = modelImages.find((img) => img.isPrimary) || modelImages[0];
    const modelImageUrl = primaryImage?.gcsUrl || primaryImage?.signedUrl || model?.avatarGcsUrl || model?.avatarUrl;
    if (!modelImageUrl) return;

    const scene = sceneImages[sceneIndex];
    if (!scene) return;

    setGeneratingScenes((prev) => new Set(prev).add(sceneIndex));
    setGenError(null);

    try {
      const res = await fetch('/api/generate-carousel-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelImageUrl,
          sceneImageUrl: scene.url,
          count: genVariantsPerScene,
          provider: genProvider,
          resolution: genResolution,
          modelId: config.modelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      const results = (data.images || []) as GenResult[];
      setGenResults((prev) => new Map(prev).set(sceneIndex, results));
      return results;
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
      return null;
    } finally {
      setGeneratingScenes((prev) => {
        const next = new Set(prev);
        next.delete(sceneIndex);
        return next;
      });
    }
  };

  // Generate All
  const handleGenerateAll = async () => {
    if (!config.modelId || sceneImages.length === 0) return;

    setIsGeneratingAll(true);
    setGenProgress({ done: 0, total: sceneImages.length });
    setGenError(null);

    // Process scenes sequentially to avoid overwhelming the API
    for (let i = 0; i < sceneImages.length; i++) {
      await generateForScene(i);
      setGenProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setIsGeneratingAll(false);
    refreshLibrary();

    // Persist config
    onChange({
      ...config,
      generateProvider: genProvider,
      generateResolution: genResolution,
      generateCount: genVariantsPerScene,
    });
  };

  const removeImage = (index: number) => {
    onChange({ ...config, images: config.images.filter((_, i) => i !== index) });
  };

  const selectAll = () => {
    if (imageSource !== 'model' || !config.modelId) return;
    const selected = new Set(config.images.map((img) => img.imageId));
    const newEntries: CarouselImageEntry[] = [];
    for (const img of modelImages) {
      if (!selected.has(img.id) && config.images.length + newEntries.length < maxImages) {
        newEntries.push({ imageId: img.id, imageUrl: img.gcsUrl || img.signedUrl, filename: img.filename });
      }
    }
    if (newEntries.length > 0) {
      onChange({ ...config, images: [...config.images, ...newEntries] });
    }
  };

  const deselectAll = () => {
    onChange({ ...config, images: [] });
  };

  // Drag-to-reorder
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const newImages = [...config.images];
      const [moved] = newImages.splice(dragIndex, 1);
      newImages.splice(dragOverIndex, 0, moved);
      onChange({ ...config, images: newImages });
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const getImageUrl = useCallback((entry: CarouselImageEntry): string | null => {
    if (entry.imageUrl) return entry.imageUrl;
    if (entry.imageId) {
      const mi = modelImages.find((m) => m.id === entry.imageId);
      return mi?.signedUrl || mi?.gcsUrl || null;
    }
    return null;
  }, [modelImages]);

  const isResultSelected = (result: GenResult) => {
    const url = result.url || result.gcsUrl;
    return isImageUrlSelected(url) || (!!result.id && isImageSelected(result.id));
  };

  return (
    <div className={`space-y-4 ${isExpanded ? 'mx-auto max-w-2xl' : ''}`}>
      {/* Image source toggle */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Image Source
        </label>
        <div className="flex gap-2">
          {(masterMode
            ? (['upload', 'generate'] as const)
            : (['model', 'upload', 'generate'] as const)
          ).map((src) => (
            <button
              key={src}
              onClick={() => handleImageSourceChange(src)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                imageSource === src
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {src === 'model' ? 'Model Gallery' : src === 'upload' ? 'Upload' : 'Generate'}
            </button>
          ))}
        </div>
      </div>

      {/* Target platform */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Target Platform
        </label>
        <div className="flex gap-2">
          {(['instagram', 'tiktok', 'both'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onChange({ ...config, targetPlatform: p, maxImages: PLATFORM_LIMITS[p] })}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium capitalize transition-all duration-150 ${
                platform === p
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {p === 'both' ? 'Both' : p}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Max {maxImages} images for {platform === 'both' ? 'Instagram (10 limit)' : platform}
        </p>
      </div>

      {/* Model selector (only in non-master mode for model gallery & generate) */}
      {!masterMode && (imageSource === 'model' || imageSource === 'generate') && (
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Model
          </label>
          <div className="relative">
            <select
              value={config.modelId || ''}
              onChange={(e) => onChange({ ...config, modelId: e.target.value || undefined, images: [] })}
              className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-8 text-sm text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
            >
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>
      )}

      {/* Image count indicator */}
      <div className="flex items-center justify-between rounded-lg bg-[var(--accent)] px-3 py-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-pink-500" />
          <span className="text-xs font-medium text-[var(--text)]">
            {config.images.length} / {maxImages} images selected
          </span>
        </div>
        <div className="flex gap-2">
          {imageSource === 'model' && config.modelId && modelImages.length > 0 && (
            <button onClick={selectAll} className="text-[10px] font-medium text-[var(--primary)] hover:underline">
              Select all
            </button>
          )}
          {config.images.length > 0 && (
            <button onClick={deselectAll} className="text-[10px] font-medium text-red-500 hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── Model Gallery mode ─── */}
      {imageSource === 'model' && config.modelId && (
        <div>
          {imagesLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
              <span className="text-xs text-[var(--text-muted)]">Loading images...</span>
            </div>
          ) : modelImages.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--text-muted)]">No images found for this model.</div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {modelImages.map((img) => {
                const selected = isImageSelected(img.id);
                const atLimit = !selected && config.images.length >= maxImages;
                return (
                  <button
                    key={img.id}
                    onClick={() => !atLimit && toggleModelImage(img)}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      selected ? 'border-pink-500 ring-2 ring-pink-500/20'
                        : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                        : 'border-[var(--border)] hover:border-pink-300'
                    }`}
                  >
                    <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-pink-500/20">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white">
                          <Check className="h-3 w-3" />
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

      {/* ─── Upload mode ─── */}
      {imageSource === 'upload' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          <div
            onClick={() => config.images.length < maxImages && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('!border-[var(--accent-border)]', '!bg-[var(--accent)]'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]'); }}
            onDrop={handleDrop}
            className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-6 transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent)] ${
              isUploadingImage || config.images.length >= maxImages ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {isUploadingImage ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">Uploading...</span>
              </>
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
                  <Upload className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {config.images.length >= maxImages ? `Limit reached (${maxImages})` : 'Click or drag images here'}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Generate mode ─── */}
      {imageSource === 'generate' && (
        <div className="space-y-4">
          {/* Provider + Resolution + Variants row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Provider</label>
              <select
                value={genProvider}
                onChange={(e) => setGenProvider(e.target.value as 'gemini' | 'fal' | 'gpt-image')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
              >
                <option value="gpt-image">GPT Image</option>
                <option value="gemini">Gemini</option>
                <option value="fal">FAL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Resolution</label>
              <select
                value={genResolution}
                onChange={(e) => setGenResolution(e.target.value as '1K' | '2K' | '4K')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Per Scene</label>
              <div className="flex gap-1">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    onClick={() => setGenVariantsPerScene(n)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                      genVariantsPerScene === n
                        ? 'bg-pink-500 text-white'
                        : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scene images upload */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Scene Images
              <span className="ml-1 font-normal normal-case text-[var(--text-muted)]">
                — upload backgrounds to face-swap the model into
              </span>
            </label>
            <input ref={sceneFileRef} type="file" accept="image/*" multiple onChange={handleSceneFileChange} className="hidden" />

            {/* Scene thumbnails */}
            {sceneImages.length > 0 && (
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {sceneImages.map((scene, i) => {
                  const isSceneGenerating = generatingScenes.has(i);
                  const hasResults = genResults.has(i);
                  return (
                    <div key={i} className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      hasResults ? 'border-green-400' : isSceneGenerating ? 'border-pink-400 animate-pulse' : 'border-[var(--border)]'
                    }`}>
                      <img src={scene.url} alt={scene.filename} className="h-full w-full object-cover" />
                      <button
                        onClick={() => removeScene(i)}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-2">
                        <span className="text-[9px] font-medium text-white">{i + 1}</span>
                      </div>
                      {isSceneGenerating && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </div>
                      )}
                      {hasResults && (
                        <div className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upload zone */}
            <div
              onClick={() => sceneFileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('!border-[var(--accent-border)]', '!bg-[var(--accent)]'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]'); }}
              onDrop={handleSceneDrop}
              className={`flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-4 transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent)] ${
                isUploadingScene ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {isUploadingScene ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                  <span className="text-[10px] text-[var(--text-muted)]">Uploading scenes...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {sceneImages.length > 0 ? 'Add more scene images' : 'Upload scene/background images'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Generate All button */}
          {masterMode ? (
            <p className="rounded-lg bg-pink-50 dark:bg-pink-950/20 px-3 py-2 text-[11px] text-pink-600 dark:text-pink-400">
              Upload scene images above. Face swap will be generated for each model when the pipeline runs.
            </p>
          ) : (
            <>
              <button
                onClick={handleGenerateAll}
                disabled={isGeneratingAll || !config.modelId || sceneImages.length === 0}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  isGeneratingAll || !config.modelId || sceneImages.length === 0
                    ? 'bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed'
                    : 'bg-pink-500 text-white hover:bg-pink-600 shadow-sm'
                }`}
              >
                {isGeneratingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating... {genProgress.done}/{genProgress.total}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate All ({sceneImages.length} scene{sceneImages.length !== 1 ? 's' : ''} × {genVariantsPerScene} variant{genVariantsPerScene !== 1 ? 's' : ''})
                  </>
                )}
              </button>

              {!config.modelId && sceneImages.length > 0 && (
                <p className="text-[10px] text-amber-500">Select a model above first.</p>
              )}
            </>
          )}
          {genError && <p className="text-[10px] text-red-500">{genError}</p>}

          {/* Generated results per scene */}
          {genResults.size > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Results — click to select for carousel
              </label>
              <div className="space-y-2">
                {Array.from(genResults.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([sceneIdx, results]) => (
                    <div key={sceneIdx} className="rounded-lg border border-[var(--border)] p-2">
                      <div className="mb-1.5 flex items-center gap-2">
                        {sceneImages[sceneIdx] && (
                          <img
                            src={sceneImages[sceneIdx].url}
                            alt=""
                            className="h-7 w-7 rounded object-cover shrink-0"
                          />
                        )}
                        <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                          Scene {sceneIdx + 1}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {sceneImages[sceneIdx]?.filename}
                        </span>
                      </div>
                      <div className={`grid gap-1.5 ${results.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {results.map((result, ri) => {
                          const selected = isResultSelected(result);
                          const atLimit = !selected && config.images.length >= maxImages;
                          // Find order position if selected
                          const orderIdx = config.images.findIndex(
                            (e) => e.imageUrl === (result.url || result.gcsUrl) || e.imageId === result.id,
                          );
                          return (
                            <button
                              key={ri}
                              onClick={() => !atLimit && toggleGenResult(result)}
                              className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all ${
                                selected ? 'border-pink-500 ring-2 ring-pink-500/20'
                                  : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                                  : 'border-[var(--border)] hover:border-pink-300'
                              }`}
                            >
                              <img src={result.url} alt="" className="h-full w-full object-cover" />
                              {results.length > 1 && (
                                <div className="absolute right-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[8px] font-bold text-white">
                                  {String.fromCharCode(65 + ri)}
                                </div>
                              )}
                              {selected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-pink-500/20">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500 text-white text-[10px] font-bold">
                                    {orderIdx + 1}
                                  </div>
                                </div>
                              )}
                              <div
                                onClick={(e) => { e.stopPropagation(); setPreviewUrl(result.url); }}
                                className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                              >
                                <Expand className="h-2.5 w-2.5" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Divider + library browser (non-master only, since library is per-model) */}
          {!masterMode && (
          <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[var(--surface)] px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Or choose from library
              </span>
            </div>
          </div>

          {/* Library images */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Generated Images {libraryTotal > 0 && `(${libraryTotal})`}
              </span>
              <button
                onClick={refreshLibrary}
                disabled={libraryLoading}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${libraryLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {libraryLoading ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                <span className="text-xs text-[var(--text-muted)]">Loading...</span>
              </div>
            ) : libraryImages.length === 0 ? (
              <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                {config.modelId ? 'No generated images for this model yet.' : 'Select a model to browse.'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {libraryImages.map((img) => {
                    const url = img.signedUrl || img.gcsUrl;
                    const selected = isImageSelected(img.id) || isImageUrlSelected(url);
                    const atLimit = !selected && config.images.length >= maxImages;
                    const orderIdx = config.images.findIndex((e) => e.imageId === img.id || e.imageUrl === url);
                    return (
                      <button
                        key={img.id}
                        onClick={() => !atLimit && toggleGeneratedImage(img)}
                        className={`group relative aspect-[9/16] overflow-hidden rounded-lg border-2 transition-all ${
                          selected ? 'border-pink-500 ring-2 ring-pink-500/20'
                            : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                            : 'border-[var(--border)] hover:border-pink-300'
                        }`}
                      >
                        <img src={url} alt={img.filename} className="h-full w-full object-cover" loading="lazy" />
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-pink-500/20">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500 text-white text-[10px] font-bold">
                              {orderIdx + 1}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {libraryTotalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setLibraryPage(Math.max(1, libraryPage - 1))}
                      disabled={libraryPage <= 1}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-[10px] text-[var(--text-muted)]">{libraryPage} / {libraryTotalPages}</span>
                    <button
                      onClick={() => setLibraryPage(Math.min(libraryTotalPages, libraryPage + 1))}
                      disabled={libraryPage >= libraryTotalPages}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </>
          )}
        </div>
      )}

      {/* ─── Selected images with order numbering (all modes) ─── */}
      {config.images.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Carousel Order (drag to reorder)
          </label>
          <div className="space-y-1.5">
            {config.images.map((entry, index) => {
              const url = getImageUrl(entry);
              return (
                <div
                  key={`${entry.imageId || entry.imageUrl}-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 rounded-lg border bg-[var(--surface)] p-1.5 transition-all ${
                    dragOverIndex === index ? 'border-pink-400 bg-pink-50 dark:bg-pink-950/20' : 'border-[var(--border)]'
                  } ${dragIndex === index ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--border)]" />
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-500 text-[10px] font-bold text-white">
                    {index + 1}
                  </div>
                  {url ? (
                    <img
                      src={url}
                      alt={entry.filename || `Image ${index + 1}`}
                      className="h-10 w-10 shrink-0 rounded object-cover cursor-pointer"
                      onClick={() => setPreviewUrl(url)}
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-[var(--accent)] flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[var(--text)]">
                      {entry.filename || `Image ${index + 1}`}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{ordinal(index + 1)} in carousel</span>
                  </div>
                  <button
                    onClick={() => removeImage(index)}
                    className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photo cover index (for TikTok) */}
      {(platform === 'tiktok' || platform === 'both') && config.images.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Cover Photo (TikTok)
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {config.images.map((entry, index) => {
              const url = getImageUrl(entry);
              const isCover = (config.photoCoverIndex ?? 0) === index;
              return (
                <button
                  key={index}
                  onClick={() => onChange({ ...config, photoCoverIndex: index })}
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                    isCover ? 'border-pink-500 ring-2 ring-pink-500/20' : 'border-[var(--border)] hover:border-pink-300'
                  }`}
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[var(--accent)]" />
                  )}
                  {isCover && (
                    <div className="absolute bottom-0 inset-x-0 bg-pink-500 py-0.5 text-center text-[8px] font-bold text-white">
                      COVER
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {previewUrl && <PreviewModal src={previewUrl} type="image" onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}
