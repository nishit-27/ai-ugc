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
import type { ExtractedFrame, FirstFrameInputMode, FirstFrameOption, ImageSource, MasterPerModelActivePanel } from './video-gen/types';
import type { ModelImage } from '@/types';

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
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [isLoadingMoreLibrary, setIsLoadingMoreLibrary] = useState(false);
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
  const [masterActivePanelByModel, setMasterActivePanelByModel] = useState<Record<string, MasterPerModelActivePanel>>({});
  const [masterModelImages, setMasterModelImages] = useState<Record<string, ModelImage[]>>({});
  const [masterModelImagesLoading, setMasterModelImagesLoading] = useState<Set<string>>(new Set());
  const [masterUploadingModelId, setMasterUploadingModelId] = useState<string | null>(null);
  const [masterErrorsByModelId, setMasterErrorsByModelId] = useState<Record<string, string>>({});

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
    setLibraryPage(1);
    try {
      const { images, total } = await fetchGeneratedImages({ modelId: config.modelId || undefined, limit: 50, page: 1 });
      setLibraryImages(await ensureSignedGeneratedImages(images as GeneratedImage[]));
      setLibraryTotal(total);
    } catch {
      // no-op
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleLoadMoreLibrary = async () => {
    const nextPage = libraryPage + 1;
    setIsLoadingMoreLibrary(true);
    try {
      const { images, total } = await fetchGeneratedImages({ modelId: config.modelId || undefined, limit: 50, page: nextPage });
      const signed = await ensureSignedGeneratedImages(images as GeneratedImage[]);
      setLibraryImages((prev) => [...prev, ...signed]);
      setLibraryTotal(total);
      setLibraryPage(nextPage);
    } catch {
      // no-op
    } finally {
      setIsLoadingMoreLibrary(false);
    }
  };

  const handleSelectLibraryImage = (img: GeneratedImage) => {
    setFirstFrameInputMode('direct-library'); setSelectedFirstFrameDisplayUrl(img.signedUrl || img.gcsUrl); setIsResolvingSelectedFirstFrame(false);
    clearFirstFrameOptions(); setGenerateError(null); onChange({ ...config, imageUrl: img.gcsUrl }); setShowLibrary(false);
  };

  // Track which sourceVideoUrl we already auto-extracted for
  const masterAutoExtractedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!masterMode || !sourceVideoUrl || isExtracting) return;
    // Skip if we already successfully extracted for this exact URL
    if (masterAutoExtractedUrlRef.current === sourceVideoUrl && extractedFrames.length > 0) return;

    masterAutoExtractedUrlRef.current = sourceVideoUrl;
    (async () => {
      setIsExtracting(true);
      setExtractError(null);
      try {
        const frames = await extractFramesFromVideo(sourceVideoUrl);
        setExtractedFrames(frames);
        setMasterAutoExtracted(true);
        if (frames.length > 0) {
          onChange({ ...config, extractedFrameUrl: frames[0].gcsUrl, firstFrameEnabled: true });
        }
      } catch (error: unknown) {
        // Reset so a retry is possible
        masterAutoExtractedUrlRef.current = null;
        setExtractError(error instanceof Error ? error.message : 'Failed to extract frames');
      } finally {
        setIsExtracting(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterMode, sourceVideoUrl]);

  const masterGenerateForModel = async (modelId: string, primaryGcsUrl: string): Promise<FirstFrameOption[] | null> => {
    if (!config.extractedFrameUrl) return null;
    setMasterGeneratingIds((prev) => new Set(prev).add(modelId));
    setMasterErrorsByModelId((prev) => { const next = { ...prev }; delete next[modelId]; return next; });
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
      const errMsg = error instanceof Error ? error.message : 'Generation failed';
      console.error(`Master first frame for ${modelId} failed:`, errMsg);
      setMasterErrorsByModelId((prev) => ({ ...prev, [modelId]: errMsg }));
      return null;
    } finally {
      setMasterGeneratingIds((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
    }
  };

  const handleMasterGenerateAll = async () => {
    if (!masterModels || !config.extractedFrameUrl) return;
    setIsMasterGeneratingAll(true);
    setMasterErrorsByModelId({});
    setMasterGeneratingIds(new Set(masterModels.map((m) => m.modelId)));
    await generateAllMasterFirstFrames({
      masterModels,
      generateForModel: masterGenerateForModel,
      onModelResult: (modelId, images) => {
        setMasterPerModelResults((prev) => ({ ...prev, [modelId]: images }));
        setMasterGeneratingIds((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
      },
      onModelError: (modelId, error) => {
        setMasterErrorsByModelId((prev) => ({ ...prev, [modelId]: error }));
        setMasterGeneratingIds((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
      },
      onProgress: (done, total) => setMasterProgress({ done, total }),
      frameImageUrl: config.extractedFrameUrl,
      resolution: config.firstFrameResolution || '1K',
      provider: config.firstFrameProvider || 'gemini',
    });
    setMasterGeneratingIds(new Set());
    setIsMasterGeneratingAll(false);
  };

  const handleMasterSelectForModel = (modelId: string, gcsUrl: string) => {
    const updated = { ...(config.masterFirstFrames || {}) };
    if (gcsUrl) {
      updated[modelId] = gcsUrl;
    } else {
      delete updated[modelId];
    }
    onChange({ ...config, masterFirstFrames: updated });
  };

  const [masterLibraryPage, setMasterLibraryPage] = useState(1);
  const [masterLibraryTotal, setMasterLibraryTotal] = useState(0);
  const [isLoadingMoreMasterLibrary, setIsLoadingMoreMasterLibrary] = useState(false);

  const handleMasterBrowseLibrary = async (modelId: string) => {
    if (masterLibraryModelId === modelId) { setMasterLibraryModelId(null); return; }

    setMasterActivePanelByModel((prev) => ({ ...prev, [modelId]: null }));
    setMasterLibraryModelId(modelId);
    setIsLoadingMasterLibrary(true);
    setMasterLibraryPage(1);
    try {
      const { images, total } = await fetchGeneratedImages({ modelId, page: 1 });
      setMasterLibraryImages(await ensureSignedGeneratedImages(images as GeneratedImage[]));
      setMasterLibraryTotal(total);
    } catch {
      // no-op
    } finally {
      setIsLoadingMasterLibrary(false);
    }
  };

  const handleLoadMoreMasterLibrary = async () => {
    if (!masterLibraryModelId) return;
    const nextPage = masterLibraryPage + 1;
    setIsLoadingMoreMasterLibrary(true);
    try {
      const { images, total } = await fetchGeneratedImages({ modelId: masterLibraryModelId, limit: 50, page: nextPage });
      const signed = await ensureSignedGeneratedImages(images as GeneratedImage[]);
      setMasterLibraryImages((prev) => [...prev, ...signed]);
      setMasterLibraryTotal(total);
      setMasterLibraryPage(nextPage);
    } catch {
      // no-op
    } finally {
      setIsLoadingMoreMasterLibrary(false);
    }
  };

  const handleMasterTogglePanel = (modelId: string, panel: 'upload' | 'model-images') => {
    setMasterActivePanelByModel((prev) => ({
      ...prev,
      [modelId]: prev[modelId] === panel ? null : panel,
    }));
    if (masterLibraryModelId === modelId) setMasterLibraryModelId(null);
  };

  const handleMasterUploadForModel = async (modelId: string, file: File) => {
    setMasterUploadingModelId(modelId);
    try {
      const data = await uploadImageFile(file);
      if (data.success) {
        const gcsUrl = data.gcsUrl || data.url || data.path;
        if (gcsUrl) {
          handleMasterSelectForModel(modelId, gcsUrl);
          setMasterActivePanelByModel((prev) => ({ ...prev, [modelId]: null }));
        }
      }
    } catch {
      // no-op
    } finally {
      setMasterUploadingModelId(null);
    }
  };

  const handleMasterFetchModelImages = async (modelId: string) => {
    if (masterModelImages[modelId]) return;
    setMasterModelImagesLoading((prev) => new Set(prev).add(modelId));
    try {
      const res = await fetch(`/api/models/${modelId}/images`);
      const data = await res.json();
      const images: ModelImage[] = Array.isArray(data) ? data : [];
      setMasterModelImages((prev) => ({ ...prev, [modelId]: images }));
    } catch {
      // no-op
    } finally {
      setMasterModelImagesLoading((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
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
      onSetProvider={(provider) => onChange({ ...config, firstFrameProvider: provider })}
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
      hasMoreLibrary={libraryImages.length < libraryTotal}
      isLoadingMoreLibrary={isLoadingMoreLibrary}
      onLoadMoreLibrary={handleLoadMoreLibrary}
    />
  );

  const masterPerModelContent = (
    <VideoGenMasterPerModelPanel
      masterMode={masterMode}
      masterModels={masterModels}
      config={config}
      isExpanded={isExpanded}
      masterPerModelResults={masterPerModelResults}
      masterGeneratingIds={masterGeneratingIds}
      masterLibraryModelId={masterLibraryModelId}
      masterLibraryImages={masterLibraryImages}
      isLoadingMasterLibrary={isLoadingMasterLibrary}
      isMasterGeneratingAll={isMasterGeneratingAll}
      masterActivePanelByModel={masterActivePanelByModel}
      masterModelImages={masterModelImages}
      masterModelImagesLoading={masterModelImagesLoading}
      masterUploadingModelId={masterUploadingModelId}
      masterErrorsByModelId={masterErrorsByModelId}
      setPreviewUrl={setPreviewUrl}
      setMasterLibraryModelId={setMasterLibraryModelId}
      masterGenerateForModel={masterGenerateForModel}
      handleMasterBrowseLibrary={handleMasterBrowseLibrary}
      handleMasterSelectForModel={handleMasterSelectForModel}
      handleMasterTogglePanel={handleMasterTogglePanel}
      handleMasterUploadForModel={handleMasterUploadForModel}
      handleMasterFetchModelImages={handleMasterFetchModelImages}
      hasMoreMasterLibrary={masterLibraryImages.length < masterLibraryTotal}
      isLoadingMoreMasterLibrary={isLoadingMoreMasterLibrary}
      onLoadMoreMasterLibrary={handleLoadMoreMasterLibrary}
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
          handleSceneUpload={handleSceneUpload}
          isUploadingScene={isUploadingScene}
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
