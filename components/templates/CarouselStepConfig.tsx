'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModels } from '@/hooks/useModels';
import { useGeneratedImages } from '@/hooks/useGeneratedImages';
import PreviewModal from '@/components/ui/PreviewModal';
import {
  Upload, X, GripVertical, Check, ImageIcon, Loader2, ChevronDown,
  Sparkles, RefreshCw, Expand, Link2,
} from 'lucide-react';
import type { CarouselImageEntry, CarouselConfig as CC, ModelImage, GeneratedImage } from '@/types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';

type ImageSource = 'model' | 'upload' | 'generate';

const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 10,
  tiktok: 35,
  both: 10,
};

type SceneAction = 'generate' | 'use-as-is' | 'skip';
type SceneImage = { url: string; filename: string; action: SceneAction };
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
  masterModels,
  isExpanded,
}: {
  config: CC;
  onChange: (c: CC) => void;
  stepId?: string;
  masterMode?: boolean;
  masterModels?: MasterModel[];
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
    (config.sceneImageUrls || []).map((url, i) => ({
      url,
      filename: `Scene ${i + 1}`,
      action: (config.sceneActions?.[i] || 'generate') as SceneAction,
    })),
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

  // URL paste state
  const [carouselUrl, setCarouselUrl] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Master mode per-model state
  const [masterGeneratingIds, setMasterGeneratingIds] = useState<Set<string>>(new Set());
  const [masterPerModelResults, setMasterPerModelResults] = useState<Record<string, GenResult[]>>({});
  const [isMasterGeneratingAll, setIsMasterGeneratingAll] = useState(false);
  const [masterGenProgress, setMasterGenProgress] = useState({ done: 0, total: 0 });

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
        if (data.success) newScenes.push({ url: data.url || data.path, filename: file.name, action: 'generate' });
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

  // Set per-scene action
  const setSceneAction = (index: number, action: SceneAction) => {
    const updated = sceneImages.map((s, i) => (i === index ? { ...s, action } : s));
    setSceneImages(updated);
    // Persist to config
    const actions: Record<number, SceneAction> = { ...config.sceneActions };
    actions[index] = action;
    onChange({ ...config, sceneActions: actions });
  };

  // Load carousel media from URL (Instagram/TikTok)
  const handleLoadCarouselUrl = async () => {
    if (!carouselUrl.trim()) return;
    setIsLoadingUrl(true);
    setUrlError(null);
    try {
      const res = await fetch('/api/fetch-carousel-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: carouselUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load media');
      const media = (data.media || []) as { url: string; type: 'image' | 'video' }[];
      // Only load images (skip videos)
      const imageMedia = media.filter((m) => m.type === 'image');
      if (imageMedia.length === 0) throw new Error('No images found in the post');
      const newScenes: SceneImage[] = imageMedia.map((m, i) => ({
        url: m.url,
        filename: `Slide ${sceneImages.length + i + 1}`,
        action: 'generate' as SceneAction,
      }));
      const updated = [...sceneImages, ...newScenes];
      setSceneImages(updated);
      onChange({ ...config, sceneImageUrls: updated.map((s) => s.url) });
      setCarouselUrl('');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to load carousel');
    } finally {
      setIsLoadingUrl(false);
    }
  };

  // Master mode: generate all scenes for one model
  const masterGenerateForModel = async (modelId: string, primaryGcsUrl: string) => {
    const generateScenes = sceneImages.filter((s) => s.action === 'generate');
    if (generateScenes.length === 0) return;

    setMasterGeneratingIds((prev) => new Set(prev).add(modelId));
    setGenError(null);

    const allResults: GenResult[] = [];
    for (const scene of generateScenes) {
      try {
        const res = await fetch('/api/generate-carousel-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelImageUrl: primaryGcsUrl,
            sceneImageUrl: scene.url,
            count: genVariantsPerScene,
            provider: genProvider,
            resolution: genResolution,
            modelId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        allResults.push(...((data.images || []) as GenResult[]));
      } catch (err) {
        console.error(`[CarouselMaster] Generation failed for model ${modelId}:`, err);
      }
    }

    // Also add "use-as-is" scenes
    const asIsScenes = sceneImages.filter((s) => s.action === 'use-as-is');
    for (const scene of asIsScenes) {
      allResults.push({ url: scene.url, gcsUrl: scene.url });
    }

    setMasterPerModelResults((prev) => ({ ...prev, [modelId]: allResults }));
    setMasterGeneratingIds((prev) => {
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });

    // Auto-select all results for this model
    if (allResults.length > 0) {
      const entries: CarouselImageEntry[] = allResults.map((r) => ({
        imageId: r.id,
        imageUrl: r.url || r.gcsUrl,
        filename: (r.url || r.gcsUrl).split('/').pop() || 'generated.jpg',
      }));
      onChange({
        ...config,
        masterCarouselImages: { ...config.masterCarouselImages, [modelId]: entries },
      });
    }

    return allResults;
  };

  // Master mode: generate for all models
  const masterGenerateAll = async () => {
    if (!masterModels || masterModels.length === 0 || sceneImages.length === 0) return;
    setIsMasterGeneratingAll(true);
    setMasterGenProgress({ done: 0, total: masterModels.length });
    for (const model of masterModels) {
      await masterGenerateForModel(model.modelId, model.primaryGcsUrl);
      setMasterGenProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setIsMasterGeneratingAll(false);
  };

  // Master mode: toggle selection of a result for a model
  const masterToggleResult = (modelId: string, result: GenResult) => {
    const current = config.masterCarouselImages?.[modelId] || [];
    const url = result.url || result.gcsUrl;
    const isSelected = current.some((e) => e.imageUrl === url || e.imageId === result.id);
    let updated: CarouselImageEntry[];
    if (isSelected) {
      updated = current.filter((e) => e.imageUrl !== url && e.imageId !== result.id);
    } else {
      if (current.length >= maxImages) return;
      updated = [...current, { imageId: result.id, imageUrl: url, filename: url.split('/').pop() || 'generated.jpg' }];
    }
    onChange({ ...config, masterCarouselImages: { ...config.masterCarouselImages, [modelId]: updated } });
  };

  const isMasterResultSelected = (modelId: string, result: GenResult) => {
    const current = config.masterCarouselImages?.[modelId] || [];
    const url = result.url || result.gcsUrl;
    return current.some((e) => e.imageUrl === url || e.imageId === result.id);
  };

  // Generate for one scene (non-master mode)
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

  // Generate All (respects per-scene actions)
  const handleGenerateAll = async () => {
    if (!config.modelId || sceneImages.length === 0) return;

    const scenesToGenerate = sceneImages.filter((s) => s.action === 'generate');
    const scenesToUseAsIs = sceneImages
      .map((s, i) => ({ ...s, originalIndex: i }))
      .filter((s) => s.action === 'use-as-is');

    setIsGeneratingAll(true);
    setGenProgress({ done: 0, total: scenesToGenerate.length });
    setGenError(null);

    // Auto-add "use-as-is" scenes to selected images
    if (scenesToUseAsIs.length > 0) {
      const newImages: CarouselImageEntry[] = [];
      for (const scene of scenesToUseAsIs) {
        if (config.images.length + newImages.length >= maxImages) break;
        if (!isImageUrlSelected(scene.url)) {
          newImages.push({ imageUrl: scene.url, filename: scene.filename });
        }
      }
      if (newImages.length > 0) {
        onChange({ ...config, images: [...config.images, ...newImages] });
      }
    }

    // Process only "generate" scenes sequentially
    for (let i = 0; i < sceneImages.length; i++) {
      if (sceneImages[i].action !== 'generate') continue;
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
    <div className={`space-y-4 ${isExpanded && !masterMode ? 'mx-auto max-w-2xl' : ''}`}>
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
                      selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                        : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
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
        <div className={isExpanded && masterMode ? 'flex gap-6 items-start' : ''}>
        {/* Left column (or full width when not expanded/master) */}
        <div className={`space-y-4 ${isExpanded && masterMode ? 'w-1/2 shrink-0' : ''}`}>
          {/* Paste carousel post URL */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Import from Post URL
              <span className="ml-1 font-normal normal-case text-[var(--text-muted)]">
                — paste an Instagram or TikTok carousel link
              </span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={carouselUrl}
                  onChange={(e) => setCarouselUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadCarouselUrl()}
                  placeholder="https://instagram.com/p/... or https://tiktok.com/..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
              <button
                onClick={handleLoadCarouselUrl}
                disabled={isLoadingUrl || !carouselUrl.trim()}
                className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  isLoadingUrl || !carouselUrl.trim()
                    ? 'bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed'
                    : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'
                }`}
              >
                {isLoadingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load'}
              </button>
            </div>
            {urlError && <p className="mt-1 text-[10px] text-red-500">{urlError}</p>}
          </div>

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
              <select
                value={genVariantsPerScene}
                onChange={(e) => setGenVariantsPerScene(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} variant{n !== 1 ? 's' : ''}</option>
                ))}
              </select>
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

            {/* Scene thumbnails with per-scene action */}
            {sceneImages.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {sceneImages.map((scene, i) => {
                  const isSceneGenerating = generatingScenes.has(i);
                  const hasResults = genResults.has(i);
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-lg border p-1.5 transition-all ${
                        scene.action === 'skip' ? 'opacity-40 border-[var(--border)]'
                          : hasResults ? 'border-green-400 bg-green-50/30 dark:bg-green-950/10'
                          : isSceneGenerating ? 'border-[var(--primary)]/60 bg-[var(--accent)]/50 dark:bg-[var(--primary)]/5'
                          : scene.action === 'use-as-is' ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/10'
                          : 'border-[var(--border)] bg-[var(--surface)]'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                        <img src={scene.url} alt={scene.filename} className="h-full w-full object-cover" />
                        {isSceneGenerating && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                          </div>
                        )}
                        {hasResults && (
                          <div className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-1">
                          <span className="text-[8px] font-bold text-white">{i + 1}</span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-[var(--text)]">
                          {scene.filename}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {scene.action === 'generate' ? (hasResults ? 'Generated' : 'Will face-swap')
                            : scene.action === 'use-as-is' ? 'Use original'
                            : 'Skipped'}
                        </span>
                      </div>

                      {/* Action dropdown */}
                      <div className="relative shrink-0">
                        <select
                          value={scene.action}
                          onChange={(e) => setSceneAction(i, e.target.value as SceneAction)}
                          className={`appearance-none rounded-md border px-2 py-1 pr-6 text-[10px] font-semibold focus:outline-none ${
                            scene.action === 'generate' ? 'border-[var(--primary)]/40 bg-[var(--accent)] text-[var(--primary)] dark:border-[var(--primary)] dark:bg-[var(--primary)]/10 dark:text-[var(--primary)]'
                              : scene.action === 'use-as-is' ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                              : 'border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          <option value="generate">Generate</option>
                          <option value="use-as-is">Use as-is</option>
                          <option value="skip">Skip</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-current opacity-50" />
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeScene(i)}
                        className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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

          {/* Master mode: summary + generate all */}
          {masterMode && masterModels && masterModels.length > 0 && (() => {
            const generateCount = sceneImages.filter((s) => s.action === 'generate').length;
            const useAsIsCount = sceneImages.filter((s) => s.action === 'use-as-is').length;
            const skipCount = sceneImages.filter((s) => s.action === 'skip').length;
            return sceneImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)]">
                  {generateCount > 0 && <span className="rounded bg-[var(--accent)] dark:bg-[var(--primary)]/10 px-1.5 py-0.5 text-[var(--primary)] dark:text-[var(--primary)]">{generateCount} to generate</span>}
                  {useAsIsCount > 0 && <span className="rounded bg-blue-100 dark:bg-blue-950/30 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">{useAsIsCount} use as-is</span>}
                  {skipCount > 0 && <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500">{skipCount} skipped</span>}
                </div>
                {generateCount > 0 && (
                  <button
                    onClick={masterGenerateAll}
                    disabled={isMasterGeneratingAll || sceneImages.length === 0}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      isMasterGeneratingAll || sceneImages.length === 0
                        ? 'bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-sm'
                    }`}
                  >
                    {isMasterGeneratingAll ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating... {masterGenProgress.done}/{masterGenProgress.total} models</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Generate All ({masterModels.length} model{masterModels.length !== 1 ? 's' : ''} × {generateCount} scene{generateCount !== 1 ? 's' : ''})</>
                    )}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Non-master mode: generate button + summary */}
          {!(masterMode && masterModels && masterModels.length > 0) && (() => {
            const generateCount = sceneImages.filter((s) => s.action === 'generate').length;
            const useAsIsCount = sceneImages.filter((s) => s.action === 'use-as-is').length;
            const skipCount = sceneImages.filter((s) => s.action === 'skip').length;
            return (
              <>
                <button
                  onClick={handleGenerateAll}
                  disabled={isGeneratingAll || !config.modelId || sceneImages.length === 0 || (generateCount === 0 && useAsIsCount === 0)}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    isGeneratingAll || !config.modelId || sceneImages.length === 0 || (generateCount === 0 && useAsIsCount === 0)
                      ? 'bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed'
                      : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-sm'
                  }`}
                >
                  {isGeneratingAll ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating... {genProgress.done}/{genProgress.total}</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> {generateCount > 0 ? `Generate ${generateCount} scene${generateCount !== 1 ? 's' : ''} × ${genVariantsPerScene}` : `Add ${useAsIsCount} image${useAsIsCount !== 1 ? 's' : ''}`}</>
                  )}
                </button>
                {sceneImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)]">
                    {generateCount > 0 && <span className="rounded bg-[var(--accent)] dark:bg-[var(--primary)]/10 px-1.5 py-0.5 text-[var(--primary)] dark:text-[var(--primary)]">{generateCount} to generate</span>}
                    {useAsIsCount > 0 && <span className="rounded bg-blue-100 dark:bg-blue-950/30 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">{useAsIsCount} use as-is</span>}
                    {skipCount > 0 && <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500">{skipCount} skipped</span>}
                  </div>
                )}
                {!config.modelId && generateCount > 0 && (
                  <p className="text-[10px] text-amber-500">Select a model above to generate face swaps.</p>
                )}
              </>
            );
          })()}
          {genError && <p className="text-[10px] text-red-500">{genError}</p>}
          </div>{/* end left column */}

          {/* Right column: per-model cards (only in master mode) */}
          {masterMode && masterModels && masterModels.length > 0 && (() => {
            const generateCount = sceneImages.filter((s) => s.action === 'generate').length;
            return (
              <div className={isExpanded ? 'flex-1 min-w-0 max-h-[70vh] overflow-y-auto space-y-2' : 'space-y-2'}>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Per Model — {generateCount > 0 ? 'generate or choose images' : 'choose images'}
                </label>
                <div className="space-y-2">
                  {masterModels.map((model) => {
                    const isGenerating = masterGeneratingIds.has(model.modelId);
                    const results = masterPerModelResults[model.modelId] || [];
                    const selectedImages = config.masterCarouselImages?.[model.modelId] || [];
                    return (
                      <div key={model.modelId} className="rounded-xl border border-[var(--border)] p-2.5 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <img src={model.primaryImageUrl} alt={model.modelName} className="h-10 w-10 rounded-lg object-cover shrink-0 border border-[var(--border)] cursor-pointer" onClick={() => setPreviewUrl(model.primaryImageUrl)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--text)] truncate">{model.modelName}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{selectedImages.length} / {maxImages} images</p>
                          </div>
                          {isGenerating && <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin shrink-0" />}
                          {!isGenerating && generateCount > 0 && (
                            <button
                              onClick={() => masterGenerateForModel(model.modelId, model.primaryGcsUrl)}
                              disabled={isMasterGeneratingAll || sceneImages.length === 0}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${results.length > 0 ? 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]' : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]'} disabled:opacity-50`}
                            >
                              {results.length > 0 ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                              {results.length > 0 ? 'Redo' : 'Generate'}
                            </button>
                          )}
                        </div>
                        {results.length > 0 && (
                          <div className={`grid gap-1.5 ${isExpanded ? 'grid-cols-5' : 'grid-cols-4'}`}>
                            {results.map((result, ri) => {
                              const selected = isMasterResultSelected(model.modelId, result);
                              const atLimit = !selected && selectedImages.length >= maxImages;
                              const orderIdx = selectedImages.findIndex((e) => e.imageUrl === (result.url || result.gcsUrl) || e.imageId === result.id);
                              return (
                                <button key={ri} onClick={() => !atLimit && masterToggleResult(model.modelId, result)} className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all ${selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}>
                                  <img src={result.url} alt="" className="h-full w-full object-cover" />
                                  {selected && (<div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20"><div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] font-bold">{orderIdx + 1}</div></div>)}
                                  <div onClick={(e) => { e.stopPropagation(); setPreviewUrl(result.url); }} className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"><Expand className="h-2 w-2" /></div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {selectedImages.length > 0 && (
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">{selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected</p>
                            <button onClick={() => onChange({ ...config, masterCarouselImages: { ...config.masterCarouselImages, [model.modelId]: [] } })} className="text-[10px] text-red-500 hover:underline">Clear</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Generated results per scene (non-master only) */}
          {genResults.size > 0 && !masterMode && (
            <div className="mt-4">
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
                                selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                                  : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                                  : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                              }`}
                            >
                              <img src={result.url} alt="" className="h-full w-full object-cover" />
                              {results.length > 1 && (
                                <div className="absolute right-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[8px] font-bold text-white">
                                  {String.fromCharCode(65 + ri)}
                                </div>
                              )}
                              {selected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold">
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
          <div className="space-y-4 mt-4">
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
                          selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                            : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                            : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                        }`}
                      >
                        <img src={url} alt={img.filename} className="h-full w-full object-cover" loading="lazy" />
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold">
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
          </div>
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
                    dragOverIndex === index ? 'border-[var(--primary)]/60 bg-[var(--accent)] dark:bg-[var(--primary)]/10' : 'border-[var(--border)]'
                  } ${dragIndex === index ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--border)]" />
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]">
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
                    isCover ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                  }`}
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[var(--accent)]" />
                  )}
                  {isCover && (
                    <div className="absolute bottom-0 inset-x-0 bg-[var(--primary)] py-0.5 text-center text-[8px] font-bold text-[var(--primary-foreground)]">
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
