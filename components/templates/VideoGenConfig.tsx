'use client';

import { useEffect, useRef, useState } from 'react';
import { useModels } from '@/hooks/useModels';
import PreviewModal from '@/components/ui/PreviewModal';
import { ensureSignedGeneratedImages } from '@/lib/generatedImagesClient';
import VideoGenMainColumn from './video-gen/VideoGenMainColumn';
import VideoGenSingleFirstFrameCard from './video-gen/VideoGenSingleFirstFrameCard';
import VideoGenMasterPerModelPanel from './video-gen/VideoGenMasterPerModelPanel';
import { useDirectLibraryPreview } from './video-gen/useDirectLibraryPreview';
import { useVideoGenStepCache, videoGenStepCache } from './video-gen/useVideoGenStepCache';
import { extractFramesFromVideo, fetchGeneratedImages, generateFirstFrameRequest, uploadImageFile } from './video-gen/api';
import { generateAllMasterFirstFrames, resolveModelImageDisplay, resolveModelImageUrl } from './video-gen/helpers';
import type { GeneratedImage, VideoGenConfig as VGC } from '@/types';
import type { MasterModel } from './NodeConfigPanel';
import type { ExtractedFrame, FirstFrameInputMode, FirstFrameOption, ImageSource } from './video-gen/types';

export default function VideoGenConfig({
  config,
  onChange,
  sourceDuration,
  sourceVideoUrl,
  stepId,
  masterMode,
  masterModels,
  isExpanded,
}: {
  config: VGC;
  onChange: (c: VGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  stepId?: string;
  masterMode?: boolean;
  masterModels?: MasterModel[];
  isExpanded?: boolean;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const cached = stepId ? videoGenStepCache.get(stepId) : undefined;

  const [imageSource, setImageSource] = useState<ImageSource>(
    () => cached?.imageSource ?? ((config.imageUrl && !config.imageId) ? 'upload' : 'model'),
  );
  const [showImageGrid, setShowImageGrid] = useState(() => cached?.showImageGrid ?? !config.imageId);
  const [firstFrameInputMode, setFirstFrameInputMode] = useState<FirstFrameInputMode>(() => cached?.firstFrameInputMode ?? 'generate');
  const [selectedFirstFrameDisplayUrl, setSelectedFirstFrameDisplayUrl] = useState<string | null>(
    () => cached?.selectedFirstFrameDisplayUrl ?? null,
  );
  const [isResolvingSelectedFirstFrame, setIsResolvingSelectedFirstFrame] = useState(false);

  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>(() => cached?.extractedFrames ?? []);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [firstFrameOptions, setFirstFrameOptionsRaw] = useState<FirstFrameOption[]>(() => cached?.firstFrameOptions ?? []);
  const [dismissedOptions, setDismissedOptions] = useState<Set<string>>(() => new Set(cached?.dismissedOptions ?? []));
  const [isGeneratingFirstFrame, setIsGeneratingFirstFrame] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [libraryImages, setLibraryImages] = useState<GeneratedImage[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [isUploadingScene, setIsUploadingScene] = useState(false);
  const [sceneDisplayUrl, setSceneDisplayUrl] = useState<string | null>(() => cached?.sceneDisplayUrl ?? null);

  const originalModelImageUrlRef = useRef<string | null>(cached?.originalModelImageUrl ?? null);
  const uploadedGcsUrlRef = useRef<string | null>(cached?.uploadedGcsUrl ?? null);

  const [masterPerModelResults, setMasterPerModelResults] = useState<Record<string, FirstFrameOption[]>>(() => cached?.masterPerModelResults ?? {});
  const [masterGeneratingIds, setMasterGeneratingIds] = useState<Set<string>>(new Set());
  const [masterLibraryModelId, setMasterLibraryModelId] = useState<string | null>(null);
  const [masterLibraryImages, setMasterLibraryImages] = useState<GeneratedImage[]>([]);
  const [isLoadingMasterLibrary, setIsLoadingMasterLibrary] = useState(false);
  const [isMasterGeneratingAll, setIsMasterGeneratingAll] = useState(false);
  const [masterProgress, setMasterProgress] = useState({ done: 0, total: 0 });
  const [masterAutoExtracted, setMasterAutoExtracted] = useState(() => cached?.masterAutoExtracted ?? false);

  const clearFirstFrameOptions = () => { setFirstFrameOptionsRaw([]); setDismissedOptions(new Set()); };
  const setFirstFrameOptions = (options: FirstFrameOption[]) => { setFirstFrameOptionsRaw(options); setDismissedOptions(new Set()); };

  useVideoGenStepCache({
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
  });

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  const resolveFaceImageForDisplay = () => resolveModelImageDisplay({
    imageSource,
    config,
    modelImages,
    originalModelImageUrl: originalModelImageUrlRef.current,
  });

  const resolveFaceImageForApi = () => resolveModelImageUrl({
    imageSource,
    config,
    modelImages,
    originalModelImageUrl: originalModelImageUrlRef.current,
    uploadedGcsUrl: uploadedGcsUrlRef.current,
  });

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    setFirstFrameInputMode('generate');
    setSelectedFirstFrameDisplayUrl(null);
    clearFirstFrameOptions();
    setGenerateError(null);
    setShowLibrary(false);
    setLibraryImages([]);
    originalModelImageUrlRef.current = null;
    uploadedGcsUrlRef.current = null;

    if (src === 'upload') { onChange({ ...config, modelId: undefined, imageId: undefined, firstFrameEnabled: false, extractedFrameUrl: undefined }); return; }
    onChange({ ...config, imageUrl: undefined, firstFrameEnabled: false, extractedFrameUrl: undefined });
  };

  const handleExtractFrames = async () => {
    if (!sourceVideoUrl) return;
    setIsExtracting(true);
    setExtractError(null);
    setExtractedFrames([]);
    try {
      setExtractedFrames(await extractFramesFromVideo(sourceVideoUrl));
    } catch (error: unknown) {
      setExtractError(error instanceof Error ? error.message : 'Failed to extract frames');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSceneUpload = async (file: File) => {
    setIsUploadingScene(true);
    setExtractError(null);
    try {
      const data = await uploadImageFile(file);
      if (data.success) {
        const persistentUrl = data.gcsUrl || data.url || data.path;
        const displayUrl = data.url || data.path || null;
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
    if (file && file.type.startsWith('image/')) handleSceneUpload(file);
  };

  const handleGenerateFirstFrame = async () => {
    const modelImageUrl = resolveFaceImageForApi();
    if (!modelImageUrl || !config.extractedFrameUrl) return;

    setFirstFrameInputMode('generate');
    if (!originalModelImageUrlRef.current) {
      originalModelImageUrlRef.current = imageSource === 'upload'
        ? (uploadedGcsUrlRef.current || config.imageUrl || null)
        : modelImageUrl;
    }

    setIsGeneratingFirstFrame(true);
    setGenerateError(null);
    clearFirstFrameOptions();

    try {
      setFirstFrameOptions(
        await generateFirstFrameRequest({
          modelImageUrl,
          frameImageUrl: config.extractedFrameUrl,
          resolution: config.firstFrameResolution || '1K',
          modelId: config.modelId || null,
          provider: config.firstFrameProvider || 'gemini',
        }),
      );
    } catch (error: unknown) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate first frame');
    } finally {
      setIsGeneratingFirstFrame(false);
    }
  };

  const handleSelectFirstFrame = (option: FirstFrameOption) => {
    setFirstFrameInputMode('generate');
    onChange({ ...config, imageUrl: option.gcsUrl });
  };

  const handleToggleFirstFrame = (enabled: boolean) => {
    if (!enabled) {
      setFirstFrameInputMode('generate'); setSelectedFirstFrameDisplayUrl(null); setShowLibrary(false);
      const restored = originalModelImageUrlRef.current;
      clearFirstFrameOptions(); setExtractedFrames([]); setGenerateError(null); originalModelImageUrlRef.current = null;
      onChange({ ...config, firstFrameEnabled: false, extractedFrameUrl: undefined, imageUrl: imageSource === 'upload' ? (restored || config.imageUrl) : undefined });
      return;
    }
    setFirstFrameInputMode('generate'); setSelectedFirstFrameDisplayUrl(null); onChange({ ...config, firstFrameEnabled: true });
  };

  const handleBrowseLibrary = async () => {
    if (showLibrary) { setShowLibrary(false); return; }

    setShowLibrary(true);
    setIsLoadingLibrary(true);
    try {
      const images = await fetchGeneratedImages({ modelId: config.modelId || undefined, limit: 50 });
      setLibraryImages(await ensureSignedGeneratedImages(images as GeneratedImage[]));
    } catch {
      // no-op
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleSelectLibraryImage = (img: GeneratedImage) => {
    setFirstFrameInputMode('direct-library'); setSelectedFirstFrameDisplayUrl(img.signedUrl || img.gcsUrl); setIsResolvingSelectedFirstFrame(false);
    clearFirstFrameOptions(); setGenerateError(null); onChange({ ...config, imageUrl: img.gcsUrl }); setShowLibrary(false);
  };

  useEffect(() => {
    if (!masterMode || !sourceVideoUrl || masterAutoExtracted || isExtracting || extractedFrames.length > 0) return;

    setMasterAutoExtracted(true);
    (async () => {
      setIsExtracting(true);
      setExtractError(null);
      try {
        const frames = await extractFramesFromVideo(sourceVideoUrl);
        setExtractedFrames(frames);
        if (frames.length > 0) {
          onChange({ ...config, extractedFrameUrl: frames[0].gcsUrl, firstFrameEnabled: true });
        }
      } catch (error: unknown) {
        setExtractError(error instanceof Error ? error.message : 'Failed to extract frames');
      } finally {
        setIsExtracting(false);
      }
    })();
  }, [config, extractedFrames.length, isExtracting, masterAutoExtracted, masterMode, onChange, sourceVideoUrl]);

  const masterGenerateForModel = async (modelId: string, primaryGcsUrl: string): Promise<FirstFrameOption[] | null> => {
    if (!config.extractedFrameUrl) return null;
    setMasterGeneratingIds((prev) => new Set(prev).add(modelId));
    try {
      const options = await generateFirstFrameRequest({
        modelImageUrl: primaryGcsUrl,
        frameImageUrl: config.extractedFrameUrl,
        resolution: config.firstFrameResolution || '1K',
        modelId,
        provider: config.firstFrameProvider || 'gemini',
      });
      setMasterPerModelResults((prev) => ({ ...prev, [modelId]: options }));
      return options;
    } catch (error) {
      console.error(`Master first frame for ${modelId} failed:`, error);
      return null;
    } finally {
      setMasterGeneratingIds((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
    }
  };

  const handleMasterGenerateAll = async () => {
    if (!masterModels || !config.extractedFrameUrl) return;
    setIsMasterGeneratingAll(true);
    await generateAllMasterFirstFrames({
      masterModels,
      generateForModel: masterGenerateForModel,
      onProgress: (done, total) => setMasterProgress({ done, total }),
    });
    setIsMasterGeneratingAll(false);
  };

  const handleMasterSelectForModel = (modelId: string, gcsUrl: string) => {
    const updated = { ...(config.masterFirstFrames || {}), [modelId]: gcsUrl };
    onChange({ ...config, masterFirstFrames: updated });
  };

  const handleMasterBrowseLibrary = async (modelId: string) => {
    if (masterLibraryModelId === modelId) { setMasterLibraryModelId(null); return; }

    setMasterLibraryModelId(modelId);
    setIsLoadingMasterLibrary(true);
    try {
      const images = await fetchGeneratedImages({ modelId });
      setMasterLibraryImages(await ensureSignedGeneratedImages(images as GeneratedImage[]));
    } catch {
      // no-op
    } finally {
      setIsLoadingMasterLibrary(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const data = await uploadImageFile(file);
      if (data.success) {
        originalModelImageUrlRef.current = null;
        uploadedGcsUrlRef.current = data.gcsUrl || null;
        clearFirstFrameOptions();
        onChange({ ...config, imageUrl: data.url || data.path, modelId: undefined, imageId: undefined });
      }
    } catch {
      // no-op
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleImageUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const file = e.dataTransfer.files?.[0]; if (file && file.type.startsWith('image/')) handleImageUpload(file);
  };

  const hasModelImage = imageSource === 'model' ? !!config.imageId : !!config.imageUrl;
  const canGenerateFirstFrame = !!(config.extractedFrameUrl && resolveFaceImageForApi());
  const isDirectLibraryFirstFrame = !!(
    config.firstFrameEnabled &&
    firstFrameInputMode === 'direct-library' &&
    config.imageUrl
  );
  const selectedFirstFramePreview = selectedFirstFrameDisplayUrl || config.imageUrl || '';

  useDirectLibraryPreview({
    isDirectLibraryFirstFrame,
    imageUrl: config.imageUrl,
    libraryImages,
    selectedFirstFrameDisplayUrl,
    setSelectedFirstFrameDisplayUrl,
    setIsResolvingSelectedFirstFrame,
  });

  const firstFrameCardContent = (
    <VideoGenSingleFirstFrameCard
      config={config}
      onChange={onChange}
      hasModelImage={hasModelImage}
      canGenerateFirstFrame={canGenerateFirstFrame}
      isDirectLibraryFirstFrame={isDirectLibraryFirstFrame}
      selectedFirstFramePreview={selectedFirstFramePreview}
      isResolvingSelectedFirstFrame={isResolvingSelectedFirstFrame}
      showLibrary={showLibrary}
      isLoadingLibrary={isLoadingLibrary}
      libraryImages={libraryImages}
      showScenePicker={showScenePicker}
      isUploadingScene={isUploadingScene}
      isExtracting={isExtracting}
      extractError={extractError}
      generateError={generateError}
      sourceVideoUrl={sourceVideoUrl}
      extractedFrames={extractedFrames}
      firstFrameOptions={firstFrameOptions}
      dismissedOptions={dismissedOptions}
      isGeneratingFirstFrame={isGeneratingFirstFrame}
      sceneDisplayUrl={sceneDisplayUrl}
      sceneFileRef={sceneFileRef}
      setShowScenePicker={setShowScenePicker}
      setFirstFrameInputMode={setFirstFrameInputMode}
      setShowLibrary={setShowLibrary}
      setPreviewUrl={setPreviewUrl}
      onSetResolution={(resolution) => onChange({ ...config, firstFrameResolution: resolution })}
      onToggleFirstFrame={handleToggleFirstFrame}
      onGenerateFirstFrame={handleGenerateFirstFrame}
      onBrowseLibrary={handleBrowseLibrary}
      onSelectLibraryImage={handleSelectLibraryImage}
      onSelectFirstFrame={handleSelectFirstFrame}
      onSelectSceneFrame={(gcsUrl) => {
        onChange({ ...config, extractedFrameUrl: gcsUrl });
        clearFirstFrameOptions();
      }}
      onClearSceneFrame={() => {
        setSceneDisplayUrl(null);
        clearFirstFrameOptions();
        onChange({ ...config, extractedFrameUrl: undefined });
      }}
      onExtractFrames={handleExtractFrames}
      onSceneFileChange={handleSceneFileChange}
      onSceneDrop={handleSceneDrop}
      resolveModelImageDisplay={resolveFaceImageForDisplay}
    />
  );

  const masterPerModelContent = (
    <VideoGenMasterPerModelPanel
      masterMode={masterMode}
      masterModels={masterModels}
      config={config}
      masterPerModelResults={masterPerModelResults}
      masterGeneratingIds={masterGeneratingIds}
      masterLibraryModelId={masterLibraryModelId}
      masterLibraryImages={masterLibraryImages}
      isLoadingMasterLibrary={isLoadingMasterLibrary}
      isMasterGeneratingAll={isMasterGeneratingAll}
      setPreviewUrl={setPreviewUrl}
      setMasterLibraryModelId={setMasterLibraryModelId}
      masterGenerateForModel={masterGenerateForModel}
      handleMasterBrowseLibrary={handleMasterBrowseLibrary}
      handleMasterSelectForModel={handleMasterSelectForModel}
    />
  );

  const rightColumnContent = masterMode ? masterPerModelContent : firstFrameCardContent;
  const hasRightColumn = isExpanded && rightColumnContent;
  const uploadedModelPreviewUrl = resolveFaceImageForDisplay();

  return (
    <div className={hasRightColumn ? 'flex gap-6' : isExpanded ? 'mx-auto max-w-2xl' : ''}>
      <div className={hasRightColumn ? 'flex-1 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2' : ''}>
        <VideoGenMainColumn
          config={config}
          onChange={onChange}
          sourceDuration={sourceDuration}
          sourceVideoUrl={sourceVideoUrl}
          masterMode={masterMode}
          masterModels={masterModels}
          isExpanded={isExpanded}
          imageSource={imageSource}
          models={models}
          modelImages={modelImages}
          imagesLoading={imagesLoading}
          showImageGrid={showImageGrid}
          isUploadingImage={isUploadingImage}
          fileRef={fileRef}
          extractedFrames={extractedFrames}
          isExtracting={isExtracting}
          showScenePicker={showScenePicker}
          sceneDisplayUrl={sceneDisplayUrl}
          isMasterGeneratingAll={isMasterGeneratingAll}
          masterProgress={masterProgress}
          masterPerModelResults={masterPerModelResults}
          firstFrameCardContent={!masterMode ? firstFrameCardContent : null}
          masterPerModelContent={masterPerModelContent}
          uploadedModelPreviewUrl={uploadedModelPreviewUrl}
          setShowImageGrid={setShowImageGrid}
          setShowScenePicker={setShowScenePicker}
          setPreviewUrl={setPreviewUrl}
          setMasterPerModelResults={setMasterPerModelResults}
          onClearOriginalModelImageUrl={() => {
            originalModelImageUrlRef.current = null;
          }}
          clearFirstFrameOptions={clearFirstFrameOptions}
          handleImageSourceChange={handleImageSourceChange}
          handleFileChange={handleFileChange}
          handleDrop={handleDrop}
          handleExtractFrames={handleExtractFrames}
          handleMasterGenerateAll={handleMasterGenerateAll}
        />
      </div>

      {hasRightColumn && (
        <div className="flex-1 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto pl-2 rounded-2xl border border-[var(--border)] bg-white dark:bg-neutral-900 p-4">
          {rightColumnContent}
        </div>
      )}

      {previewUrl && <PreviewModal src={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}
