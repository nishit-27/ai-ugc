'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModels } from '@/hooks/useModels';
import PreviewModal from '@/components/ui/PreviewModal';
import { ensureSignedGeneratedImages } from '@/lib/generatedImagesClient';
import BatchVideoGenFirstFramesSection from './batch-video-gen/BatchVideoGenFirstFramesSection';
import BatchVideoGenMainColumn from './batch-video-gen/BatchVideoGenMainColumn';
import type { BatchImageEntry, BatchVideoGenConfig as BVGC, GeneratedImage, ModelImage } from '@/types';
import type { ExtractedFrame, FirstFrameOption, ImageSource } from './batch-video-gen/types';

type BatchCachedStepState = {
  extractedFrames: ExtractedFrame[];
  firstFrameResults: [number, FirstFrameOption[]][];
  imageSource: ImageSource;
};

const _batchStepCache = new Map<string, BatchCachedStepState>();

export default function BatchVideoGenConfig({
  config,
  onChange,
  sourceDuration,
  sourceVideoUrl,
  stepId,
  masterMode,
  isExpanded,
}: {
  config: BVGC;
  onChange: (c: BVGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  stepId?: string;
  masterMode?: boolean;
  isExpanded?: boolean;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const cached = stepId ? _batchStepCache.get(stepId) : undefined;

  const [imageSource, setImageSource] = useState<ImageSource>(
    () => cached?.imageSource ?? ((config.images.length > 0 && config.images.some((img) => img.imageUrl && !img.imageId)) ? 'upload' : 'model'),
  );

  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>(() => cached?.extractedFrames ?? []);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [firstFrameResults, setFirstFrameResults] = useState<Map<number, FirstFrameOption[]>>(
    () => new Map(cached?.firstFrameResults ?? []),
  );
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState({ done: 0, total: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [openLibraryIndex, setOpenLibraryIndex] = useState<number | null>(null);
  const [libraryLoadingIndex, setLibraryLoadingIndex] = useState<number | null>(null);
  const [libraryImagesByIndex, setLibraryImagesByIndex] = useState<Map<number, GeneratedImage[]>>(new Map());

  const extractedFramesRef = useRef(extractedFrames);
  extractedFramesRef.current = extractedFrames;
  const firstFrameResultsRef = useRef(firstFrameResults);
  firstFrameResultsRef.current = firstFrameResults;
  const imageSourceRef = useRef(imageSource);
  imageSourceRef.current = imageSource;

  useEffect(() => {
    return () => {
      if (!stepId) return;
      _batchStepCache.set(stepId, {
        extractedFrames: extractedFramesRef.current,
        firstFrameResults: Array.from(firstFrameResultsRef.current.entries()),
        imageSource: imageSourceRef.current,
      });
    };
  }, [stepId]);

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  const resolveEntryImageUrl = useCallback((entry: BatchImageEntry): string | null => {
    if (entry.originalImageUrl) return entry.originalImageUrl;
    if (entry.originalImageId) {
      const modelImage = modelImages.find((m) => m.id === entry.originalImageId);
      return modelImage?.gcsUrl || modelImage?.signedUrl || null;
    }
    if (entry.imageId) {
      const modelImage = modelImages.find((m) => m.id === entry.imageId);
      return modelImage?.gcsUrl || modelImage?.signedUrl || null;
    }
    return entry.imageUrl || null;
  }, [modelImages]);

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    setFirstFrameResults(new Map());
    setGeneratingIndices(new Set());
    setOpenLibraryIndex(null);
    setLibraryLoadingIndex(null);
    setLibraryImagesByIndex(new Map());
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
    } catch (error: unknown) {
      setExtractError(error instanceof Error ? error.message : 'Failed to extract frames');
    } finally {
      setIsExtracting(false);
    }
  };

  const isImageSelected = (imgId: string) => config.images.some((img) => img.imageId === imgId);

  const toggleModelImage = (img: ModelImage) => {
    if (isImageSelected(img.id)) {
      const index = config.images.findIndex((entry) => entry.imageId === img.id);
      const newResults = new Map(firstFrameResults);
      newResults.delete(index);
      setFirstFrameResults(newResults);
      onChange({ ...config, images: config.images.filter((entry) => entry.imageId !== img.id) });
      return;
    }
    onChange({ ...config, images: [...config.images, { imageId: img.id, filename: img.filename }] });
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
        if (data.success) newImages.push({ imageUrl: data.url || data.path, filename: file.name });
      } catch {
        // keep upload batch resilient to single-file failures
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
    if (files.length === 0) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const dt = new DataTransfer();
    imageFiles.forEach((file) => dt.items.add(file));
    handleImageUpload(dt.files);
  };

  const removeImage = (index: number) => {
    const newResults = new Map(firstFrameResults);
    newResults.delete(index);
    const reKeyedResults = new Map<number, FirstFrameOption[]>();
    newResults.forEach((value, key) => reKeyedResults.set(key > index ? key - 1 : key, value));
    setFirstFrameResults(reKeyedResults);

    const newLibrary = new Map(libraryImagesByIndex);
    newLibrary.delete(index);
    const reKeyedLibrary = new Map<number, GeneratedImage[]>();
    newLibrary.forEach((value, key) => reKeyedLibrary.set(key > index ? key - 1 : key, value));
    setLibraryImagesByIndex(reKeyedLibrary);

    if (openLibraryIndex !== null) {
      if (openLibraryIndex === index) setOpenLibraryIndex(null);
      else if (openLibraryIndex > index) setOpenLibraryIndex(openLibraryIndex - 1);
    }

    if (libraryLoadingIndex !== null) {
      if (libraryLoadingIndex === index) setLibraryLoadingIndex(null);
      else if (libraryLoadingIndex > index) setLibraryLoadingIndex(libraryLoadingIndex - 1);
    }

    onChange({ ...config, images: config.images.filter((_, i) => i !== index) });
  };

  const generateFirstFrameForIndex = async (index: number, images: BatchImageEntry[]): Promise<FirstFrameOption[] | null> => {
    const entry = images[index];
    const modelImageUrl = resolveEntryImageUrl(entry);
    if (!modelImageUrl || !config.extractedFrameUrl) return null;

    setGeneratingIndices((prev) => new Set(prev).add(index));

    try {
      const res = await fetch('/api/generate-first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelImageUrl,
          frameImageUrl: config.extractedFrameUrl,
          resolution: config.firstFrameResolution || '1K',
          modelId: config.modelId || null,
          provider: config.firstFrameProvider || 'gemini',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');

      const options: FirstFrameOption[] = data.images || [];
      setFirstFrameResults((prev) => new Map(prev).set(index, options));

      const newImages = [...images];
      if (!newImages[index].originalImageId && newImages[index].imageId) {
        newImages[index] = { ...newImages[index], originalImageId: newImages[index].imageId };
      }
      if (!newImages[index].originalImageUrl && newImages[index].imageUrl) {
        newImages[index] = { ...newImages[index], originalImageUrl: newImages[index].imageUrl };
      }
      newImages[index] = { ...newImages[index], generatedOptions: options.map((opt) => opt.gcsUrl) };
      onChange({ ...config, images: newImages });
      return options;
    } catch (error) {
      console.error(`Generate first frame for index ${index} failed:`, error);
      return null;
    } finally {
      setGeneratingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleGenerateAll = async () => {
    if (!config.extractedFrameUrl) return;
    setIsGeneratingAll(true);

    const total = config.images.length;
    setGenerateAllProgress({ done: 0, total });

    let done = 0;
    const promises = config.images.map((_, idx) =>
      generateFirstFrameForIndex(idx, config.images).then(() => {
        done += 1;
        setGenerateAllProgress({ done: Math.min(done, total), total });
      }),
    );
    await Promise.all(promises);

    setIsGeneratingAll(false);
  };

  const handleSelectFirstFrameForIndex = (index: number, option: FirstFrameOption) => {
    const newImages = [...config.images];
    if (!newImages[index].originalImageId && newImages[index].imageId) {
      newImages[index] = { ...newImages[index], originalImageId: newImages[index].imageId };
    }
    if (!newImages[index].originalImageUrl && newImages[index].imageUrl) {
      newImages[index] = { ...newImages[index], originalImageUrl: newImages[index].imageUrl };
    }
    newImages[index] = { ...newImages[index], imageUrl: option.gcsUrl };
    onChange({ ...config, images: newImages });
  };

  const handleBrowseLibraryForIndex = async (index: number) => {
    if (openLibraryIndex === index) {
      setOpenLibraryIndex(null);
      return;
    }

    setOpenLibraryIndex(index);
    const cachedImages = libraryImagesByIndex.get(index);
    if (cachedImages && cachedImages.length > 0) return;

    setLibraryLoadingIndex(index);
    try {
      const url = config.modelId
        ? `/api/generated-images?modelId=${config.modelId}&signed=true`
        : '/api/generated-images?limit=80&signed=true';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        const signedImages = await ensureSignedGeneratedImages(data.images || []);
        setLibraryImagesByIndex((prev) => new Map(prev).set(index, signedImages));
      }
    } catch {
      // keep empty on failure
    } finally {
      setLibraryLoadingIndex((prev) => (prev === index ? null : prev));
    }
  };

  const handleSelectLibraryForIndex = (index: number, img: GeneratedImage) => {
    const newImages = [...config.images];
    if (!newImages[index].originalImageId && newImages[index].imageId) {
      newImages[index] = { ...newImages[index], originalImageId: newImages[index].imageId };
    }
    if (!newImages[index].originalImageUrl && newImages[index].imageUrl) {
      newImages[index] = { ...newImages[index], originalImageUrl: newImages[index].imageUrl };
    }
    newImages[index] = { ...newImages[index], imageUrl: img.gcsUrl };
    onChange({ ...config, images: newImages });
    setOpenLibraryIndex(null);
  };

  const handleToggleFirstFrame = (enabled: boolean) => {
    if (!enabled) {
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
      return;
    }

    onChange({ ...config, firstFrameEnabled: true });
  };

  const getEntryDisplayUrl = (entry: BatchImageEntry): string => {
    const originalUrl = entry.originalImageUrl || entry.imageUrl;
    if (originalUrl) return originalUrl;

    const originalId = entry.originalImageId || entry.imageId;
    if (!originalId) return '';

    const modelImage = modelImages.find((m) => m.id === originalId);
    return modelImage?.signedUrl || modelImage?.gcsUrl || '';
  };

  const firstFramesSectionContent = !masterMode ? (
    <BatchVideoGenFirstFramesSection
      config={config}
      onChange={onChange}
      sourceVideoUrl={sourceVideoUrl}
      isExtracting={isExtracting}
      extractError={extractError}
      extractedFrames={extractedFrames}
      firstFrameResults={firstFrameResults}
      generatingIndices={generatingIndices}
      isGeneratingAll={isGeneratingAll}
      generateAllProgress={generateAllProgress}
      openLibraryIndex={openLibraryIndex}
      libraryLoadingIndex={libraryLoadingIndex}
      libraryImagesByIndex={libraryImagesByIndex}
      setFirstFrameResults={setFirstFrameResults}
      setPreviewUrl={setPreviewUrl}
      getEntryDisplayUrl={getEntryDisplayUrl}
      handleToggleFirstFrame={handleToggleFirstFrame}
      handleExtractFrames={handleExtractFrames}
      handleGenerateAll={handleGenerateAll}
      generateFirstFrameForIndex={generateFirstFrameForIndex}
      handleSelectFirstFrameForIndex={handleSelectFirstFrameForIndex}
      handleBrowseLibraryForIndex={handleBrowseLibraryForIndex}
      handleSelectLibraryForIndex={handleSelectLibraryForIndex}
    />
  ) : null;

  const hasRightColumn = isExpanded && firstFramesSectionContent;

  return (
    <div className={hasRightColumn ? 'flex gap-6' : isExpanded ? 'mx-auto max-w-2xl' : ''}>
      <div className={hasRightColumn ? 'flex-1 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2' : ''}>
        <BatchVideoGenMainColumn
          config={config}
          onChange={onChange}
          sourceDuration={sourceDuration}
          masterMode={masterMode}
          imageSource={imageSource}
          models={models}
          modelImages={modelImages}
          imagesLoading={imagesLoading}
          isUploadingImage={isUploadingImage}
          isExpanded={isExpanded}
          firstFramesSectionContent={firstFramesSectionContent}
          setPreviewUrl={setPreviewUrl}
          handleImageSourceChange={handleImageSourceChange}
          setFirstFrameResults={setFirstFrameResults}
          isImageSelected={isImageSelected}
          toggleModelImage={toggleModelImage}
          removeImage={removeImage}
          fileRef={fileRef}
          handleFileChange={handleFileChange}
          handleDrop={handleDrop}
        />
      </div>

      {hasRightColumn && (
        <div className="flex-1 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto pl-2">
          {firstFramesSectionContent}
        </div>
      )}

      {previewUrl && <PreviewModal src={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}
