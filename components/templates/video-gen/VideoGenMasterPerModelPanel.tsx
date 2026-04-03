import { AlertCircle, Clock, Expand, ImageIcon, Sparkles, Upload, User, RefreshCw, X } from 'lucide-react';
import type { GeneratedImage, ModelImage, VideoGenConfig as VGC } from '@/types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import type { FirstFrameOption, MasterPerModelActivePanel, QueueState } from './types';

type Props = {
  masterMode?: boolean;
  masterModels?: MasterModel[];
  config: VGC;
  isExpanded?: boolean;
  masterPerModelResults: Record<string, FirstFrameOption[]>;
  allowedMismatchUrls: Set<string>;
  masterGeneratingIds: Set<string>;
  masterLibraryModelId: string | null;
  masterLibraryImages: GeneratedImage[];
  isLoadingMasterLibrary: boolean;
  isMasterGeneratingAll: boolean;
  masterActivePanelByModel: Record<string, MasterPerModelActivePanel>;
  masterModelImages: Record<string, ModelImage[]>;
  masterModelImagesLoading: Set<string>;
  masterUploadingModelId: string | null;
  masterErrorsByModelId?: Record<string, string>;
  masterQueueState?: QueueState;
  setPreviewUrl: (url: string | null) => void;
  setMasterLibraryModelId: (modelId: string | null) => void;
  masterGenerateForModel: (modelId: string, primaryGcsUrl: string) => Promise<FirstFrameOption[] | null>;
  handleMasterBrowseLibrary: (modelId: string) => Promise<void>;
  handleMasterSelectForModel: (modelId: string, gcsUrl: string) => void;
  handleMasterAllowMismatchForModel: (modelId: string, option: FirstFrameOption) => void;
  handleMasterTogglePanel: (modelId: string, panel: 'upload' | 'model-images') => void;
  handleMasterUploadForModel: (modelId: string, file: File) => Promise<void>;
  handleMasterFetchModelImages: (modelId: string) => Promise<void>;
  hasMoreMasterLibrary?: boolean;
  isLoadingMoreMasterLibrary?: boolean;
  onLoadMoreMasterLibrary?: () => void;
};

function ActionButton({
  icon: Icon,
  label,
  isExpanded,
  isActive,
  onClick,
  disabled,
}: {
  icon: typeof ImageIcon;
  label: string;
  isExpanded?: boolean;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
        isActive
          ? 'bg-master text-white'
          : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {isExpanded && <span className="truncate">{label}</span>}
    </button>
  );
}

export default function VideoGenMasterPerModelPanel({
  masterMode,
  masterModels,
  config,
  isExpanded,
  masterPerModelResults,
  allowedMismatchUrls,
  masterGeneratingIds,
  masterLibraryModelId,
  masterLibraryImages,
  isLoadingMasterLibrary,
  isMasterGeneratingAll,
  masterActivePanelByModel,
  masterModelImages,
  masterModelImagesLoading,
  masterUploadingModelId,
  masterErrorsByModelId,
  masterQueueState,
  setPreviewUrl,
  setMasterLibraryModelId,
  masterGenerateForModel,
  handleMasterBrowseLibrary,
  handleMasterSelectForModel,
  handleMasterAllowMismatchForModel,
  handleMasterTogglePanel,
  handleMasterUploadForModel,
  handleMasterFetchModelImages,
  hasMoreMasterLibrary,
  isLoadingMoreMasterLibrary,
  onLoadMoreMasterLibrary,
}: Props) {
  if (!masterMode || !masterModels || masterModels.length === 0 || !config.extractedFrameUrl) {
    return null;
  }

  return (
    <div className="space-y-2">
      {masterModels.map((model) => {
        const results = masterPerModelResults[model.modelId] || [];
        const selected = config.masterFirstFrames?.[model.modelId];
        const selectedGeneratedResult = results.find((opt) => opt.gcsUrl === selected);
        const isSelectedMismatchAllowed = !!selectedGeneratedResult
          && selectedGeneratedResult.reviewStatus === 'mismatch'
          && allowedMismatchUrls.has(selectedGeneratedResult.gcsUrl);
        const isGenerating = masterGeneratingIds.has(model.modelId);
        const activePanel = masterActivePanelByModel[model.modelId] ?? null;
        const isLibraryOpen = masterLibraryModelId === model.modelId;
        const modelImgs = masterModelImages[model.modelId];
        const isLoadingModelImgs = masterModelImagesLoading.has(model.modelId);
        const isUploading = masterUploadingModelId === model.modelId;
        const hasResults = results.length > 0;
        const modelError = masterErrorsByModelId?.[model.modelId];
        const queueEntry = masterQueueState?.[model.modelId];
        const isQueued = queueEntry?.status === 'queued';
        return (
          <div key={model.modelId} className={`rounded-xl border p-2.5 space-y-2 transition-colors ${
            isGenerating ? 'border-master/50 bg-master/5' : isQueued ? 'border-[var(--border)] opacity-70' : 'border-[var(--border)]'
          }`}>
            <div className="flex items-center gap-2.5">
              <img
                src={model.primaryImageUrl}
                alt={model.modelName}
                className="h-10 w-10 rounded-lg object-cover shrink-0 border border-[var(--border)] cursor-pointer"
                onClick={() => setPreviewUrl(model.primaryImageUrl)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text)] truncate">{model.modelName}</p>
                {selected ? (
                  <button
                    onClick={() => handleMasterSelectForModel(model.modelId, '')}
                    className={`flex items-center gap-1 text-[10px] font-medium transition-colors group hover:text-red-500 dark:hover:text-red-400 ${
                      isSelectedMismatchAllowed
                        ? 'text-amber-600 dark:text-amber-300'
                        : selectedGeneratedResult?.reviewStatus === 'mismatch'
                        ? 'text-red-600 dark:text-red-400'
                        : selectedGeneratedResult?.reviewStatus === 'match'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-green-600 dark:text-green-400'
                    }`}
                    title={selectedGeneratedResult?.reviewReason || undefined}
                  >
                    {isSelectedMismatchAllowed ? 'Allowed by you' : selectedGeneratedResult?.reviewLabel || 'First frame selected'}
                    <X className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : isQueued && queueEntry?.position ? (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <Clock className="h-3 w-3" />
                    Queue position #{queueEntry.position}
                  </span>
                ) : isGenerating ? (
                  <span className="text-[10px] text-master font-medium">Generating...</span>
                ) : null}
              </div>
              {isGenerating && <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin shrink-0" />}
              {isQueued && (
                <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] shrink-0">
                  Queued
                </span>
              )}
              {!isGenerating && !isQueued && (
                <div className="flex items-center gap-1 shrink-0">
                  <ActionButton
                    icon={ImageIcon}
                    label={isLibraryOpen ? 'Hide' : 'Choose'}
                    isExpanded={isExpanded}
                    isActive={isLibraryOpen}
                    onClick={() => handleMasterBrowseLibrary(model.modelId)}
                  />
                  <ActionButton
                    icon={hasResults || modelError ? RefreshCw : Sparkles}
                    label={modelError ? 'Retry' : hasResults ? 'Redo' : 'Generate'}
                    isExpanded={isExpanded}
                    onClick={() => masterGenerateForModel(model.modelId, model.primaryGcsUrl)}
                    disabled={isGenerating}
                  />
                  <ActionButton
                    icon={Upload}
                    label="Upload"
                    isExpanded={isExpanded}
                    isActive={activePanel === 'upload'}
                    onClick={() => handleMasterTogglePanel(model.modelId, 'upload')}
                  />
                  <ActionButton
                    icon={User}
                    label="Model"
                    isExpanded={isExpanded}
                    isActive={activePanel === 'model-images'}
                    onClick={() => {
                      handleMasterTogglePanel(model.modelId, 'model-images');
                      if (activePanel !== 'model-images') handleMasterFetchModelImages(model.modelId);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Error display */}
            {modelError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-2.5 py-2">
                <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[10px] text-red-500 leading-tight">{modelError}</p>
                  <button
                    onClick={() => masterGenerateForModel(model.modelId, model.primaryGcsUrl)}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry now
                  </button>
                </div>
              </div>
            )}

            {selectedGeneratedResult?.reviewStatus === 'mismatch' && !isSelectedMismatchAllowed && (
              <button
                onClick={() => handleMasterAllowMismatchForModel(model.modelId, selectedGeneratedResult)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-600 transition-colors hover:bg-amber-500/15 dark:text-amber-300"
              >
                Allow And Select
              </button>
            )}

            {/* Generated results grid */}
            {results.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {results.map((opt, index) => {
                  const isSelected = selected === opt.gcsUrl;
                  const isAllowedMismatch = opt.reviewStatus === 'mismatch' && allowedMismatchUrls.has(opt.gcsUrl);
                  const hasMatchBadge = (!!opt.reviewLabel && opt.reviewStatus !== 'unknown') || isAllowedMismatch;
                  const isMatch = opt.reviewStatus === 'match';
                  const isMismatch = opt.reviewStatus === 'mismatch';
                  return (
                    <button
                      key={index}
                      onClick={() => handleMasterSelectForModel(model.modelId, opt.gcsUrl)}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all duration-150 ${
                        isSelected
                          ? isMatch
                            ? 'border-green-500 shadow-md'
                            : isAllowedMismatch
                              ? 'border-amber-500 shadow-md'
                              : isMismatch
                              ? 'border-red-500 shadow-md'
                              : 'border-master shadow-md'
                          : 'border-[var(--border)] hover:border-master-muted'
                      }`}
                      title={opt.reviewReason || undefined}
                    >
                      <img src={opt.url} alt={`Option ${String.fromCharCode(65 + index)}`} className="h-full w-full object-cover" />
                        {hasMatchBadge && (
                          <div
                            className={`absolute left-1.5 top-1.5 z-10 rounded-full px-1.5 py-0.5 text-[8px] font-semibold text-white shadow-sm ${
                            isMatch ? 'bg-green-600/95' : isAllowedMismatch ? 'bg-amber-500/95' : 'bg-red-600/95'
                          }`}
                          >
                          {isAllowedMismatch ? 'Allowed' : opt.reviewLabel}
                          </div>
                        )}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewUrl(opt.url);
                        }}
                        className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                      >
                        <Expand className="h-2.5 w-2.5" />
                      </div>
                      {isSelected && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-master/90 to-transparent py-1 text-center">
                          <span className="text-[10px] font-semibold text-white">Selected</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Upload panel */}
            {activePanel === 'upload' && (
              <div className="rounded-lg bg-[var(--background)] p-2 space-y-1.5 border border-[var(--border)]">
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                    <span className="text-[10px] text-[var(--text-muted)]">Uploading...</span>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-master/50 hover:bg-master/5 transition-colors"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('!border-master/50', '!bg-master/5'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('!border-master/50', '!bg-master/5'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('!border-master/50', '!bg-master/5');
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) handleMasterUploadForModel(model.modelId, file);
                    }}
                  >
                    <Upload className="h-5 w-5 text-[var(--text-muted)]" />
                    <span className="text-[10px] text-[var(--text-muted)]">Drop image or click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMasterUploadForModel(model.modelId, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Model reference images panel */}
            {activePanel === 'model-images' && (
              <div className="rounded-lg bg-[var(--background)] p-2 space-y-1.5 border border-[var(--border)]">
                {isLoadingModelImgs ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                    <span className="text-[10px] text-[var(--text-muted)]">Loading...</span>
                  </div>
                ) : !modelImgs || modelImgs.length === 0 ? (
                  <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">No reference images</p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-[300px] overflow-y-auto">
                    {modelImgs.map((img) => {
                      const displayUrl = img.signedUrl || img.gcsUrl;
                      const isSelected = selected === img.gcsUrl;
                      return (
                        <button
                          key={img.id}
                          onClick={() => {
                            handleMasterSelectForModel(model.modelId, img.gcsUrl);
                            handleMasterTogglePanel(model.modelId, 'model-images');
                          }}
                          className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                            isSelected ? 'border-master shadow-md' : 'border-[var(--border)] hover:border-master-muted'
                          }`}
                        >
                          <img src={displayUrl} alt={img.filename} className="h-full w-full object-cover" />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(displayUrl);
                            }}
                            className="absolute bottom-0.5 right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                          >
                            <Expand className="h-2 w-2" />
                          </div>
                          {isSelected && (
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-master/90 to-transparent py-0.5 text-center">
                              <span className="text-[9px] font-semibold text-white">Selected</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Library panel (Choose) */}
            {isLibraryOpen && (
              <div className="rounded-lg bg-[var(--background)] p-2 space-y-1.5 border border-[var(--border)]">
                {isLoadingMasterLibrary ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                    <span className="text-[10px] text-[var(--text-muted)]">Loading...</span>
                  </div>
                ) : masterLibraryImages.length === 0 ? (
                  <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">No previous generations</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-1.5 max-h-[300px] overflow-y-auto">
                      {masterLibraryImages.map((img) => {
                        const displayUrl = img.signedUrl || img.gcsUrl;
                        const isSelected = selected === img.gcsUrl;
                        return (
                          <button
                            key={img.id}
                            onClick={() => {
                              handleMasterSelectForModel(model.modelId, img.gcsUrl);
                              setMasterLibraryModelId(null);
                            }}
                            className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                              isSelected ? 'border-master shadow-md' : 'border-[var(--border)] hover:border-master-muted'
                            }`}
                          >
                            <img src={displayUrl} alt={img.filename} className="h-full w-full object-cover" />
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl(displayUrl);
                              }}
                              className="absolute bottom-0.5 right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                            >
                              <Expand className="h-2 w-2" />
                            </div>
                            {isSelected && (
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-master/90 to-transparent py-0.5 text-center">
                                <span className="text-[9px] font-semibold text-white">Selected</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {hasMoreMasterLibrary && (
                      <button
                        onClick={onLoadMoreMasterLibrary}
                        disabled={isLoadingMoreMasterLibrary}
                        className="w-full rounded-lg bg-[var(--accent)] px-2.5 py-2 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-border)]/30 disabled:opacity-50 transition-colors"
                      >
                        {isLoadingMoreMasterLibrary ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <span className="h-3 w-3 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          'Load More'
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
