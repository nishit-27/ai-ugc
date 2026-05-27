'use client';

import {
  ChevronDown, ChevronRight, ImageIcon, Loader2, Sparkles, RefreshCw,
  RotateCcw, Expand, X,
} from 'lucide-react';
import type { CarouselImageEntry, GeneratedImage } from '@/types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import { flattenPerSceneResults, type GenResult, type SceneImage } from './carouselStepHelpers';

// Renders one model card inside the master-mode per-model section.
// All state lives in the parent (CarouselStepConfig); this component is
// purely presentational so the parent stays the source of truth for
// generation, library browsing, and image selection.
//
// The prop surface is deliberately wide because the card depends on a lot
// of cross-cutting state — that complexity already lived inside the
// parent's render loop, this just makes it visible at the boundary.
export default function MasterModelCard({
  model,
  isCollapsed,
  isGenerating,
  isMasterGeneratingAll,
  isExpanded,
  generateCount,
  activeSceneCount,
  maxImages,
  sceneImages,
  perSceneResults,
  selectedImages,
  extras,
  regeneratingScenes,
  // library browser state
  isBrowsingLibrary,
  modelLibraryImages,
  modelLibraryLoading,
  modelLibraryPage,
  modelLibraryTotal,
  modelLibraryTotalPages,
  choosingForScene,
  isAddingExtra,
  // handlers
  onToggleCollapsed,
  onPreview,
  onToggleLibrary,
  onGenerateMissing,
  onRetryFailed,
  onGenerateForModel,
  onRegenerateScene,
  openLibraryForChoosing,
  onRemoveExtra,
  onCloseLibrary,
  onClearChoosingScene,
  onClearAddingExtra,
  onChooseLibraryForScene,
  onAddExtraImage,
  onToggleLibraryImage,
  onToggleResult,
  isResultSelected,
  onLoadLibraryPage,
  onClearSelection,
}: {
  model: MasterModel;
  isCollapsed: boolean;
  isGenerating: boolean;
  isMasterGeneratingAll: boolean;
  isExpanded?: boolean;
  generateCount: number;
  activeSceneCount: number;
  maxImages: number;
  sceneImages: SceneImage[];
  perSceneResults: Record<number, GenResult[]>;
  selectedImages: CarouselImageEntry[];
  extras: GenResult[];
  regeneratingScenes: Set<string>;
  isBrowsingLibrary: boolean;
  modelLibraryImages: GeneratedImage[];
  modelLibraryLoading: boolean;
  modelLibraryPage: number;
  modelLibraryTotal: number;
  modelLibraryTotalPages: number;
  choosingForScene: { modelId: string; sceneIndex: number } | null;
  isAddingExtra: boolean;
  onToggleCollapsed: () => void;
  onPreview: (url: string) => void;
  onToggleLibrary: () => void;
  onGenerateMissing: () => void;
  onRetryFailed: () => void;
  onGenerateForModel: () => void;
  onRegenerateScene: (sceneIdx: number) => void;
  openLibraryForChoosing: (sceneIndex?: number) => void;
  onRemoveExtra: (extraIndex: number) => void;
  onCloseLibrary: () => void;
  onClearChoosingScene: () => void;
  onClearAddingExtra: () => void;
  onChooseLibraryForScene: (sceneIndex: number, img: GeneratedImage) => void;
  onAddExtraImage: (img: GeneratedImage) => void;
  onToggleLibraryImage: (img: GeneratedImage) => void;
  onToggleResult: (result: GenResult) => void;
  isResultSelected: (result: GenResult) => boolean;
  onLoadLibraryPage: (page: number) => void;
  onClearSelection: () => void;
}) {
  const allResults = flattenPerSceneResults(perSceneResults);
  const totalScenes = sceneImages.filter((s) => s.action === 'generate').length;
  const completedScenes = Object.entries(perSceneResults).filter(([idx, r]) => {
    const si = sceneImages[Number(idx)];
    return si?.action === 'generate' && r.length > 0;
  }).length;
  const hasMissing = totalScenes > 0 && completedScenes < totalScenes && completedScenes > 0;
  const failedCount = Object.entries(perSceneResults).filter(([idx, r]) => {
    const si = sceneImages[Number(idx)];
    return si?.action === 'generate' && Array.isArray(r) && r.length === 0;
  }).length;
  const hasFailed = failedCount > 0;

  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5 space-y-2">
      {/* Clickable header row */}
      <div
        className="flex items-center gap-2.5 cursor-pointer select-none"
        onClick={onToggleCollapsed}
      >
        {isCollapsed
          ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        }
        <img
          src={model.primaryImageUrl}
          alt={model.modelName}
          className="h-10 w-10 rounded-lg object-cover shrink-0 border border-[var(--border)] cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onPreview(model.primaryImageUrl); }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--text)] truncate">{model.modelName}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {`${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''}`}
            {selectedImages.length > 0 && ` / ${maxImages} max`}
            {totalScenes > 0 && completedScenes > 0 && ` · ${completedScenes}/${totalScenes} done`}
            {selectedImages.length === 0 && activeSceneCount > 0 && !isGenerating && (
              <span className="ml-1 text-amber-500">· pending</span>
            )}
          </p>
        </div>
        {isGenerating && <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin shrink-0" />}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleLibrary}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold border transition-colors ${isBrowsingLibrary ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'}`}
          >
            <ImageIcon className="h-3 w-3" /> Browse
          </button>
          {!isGenerating && !isMasterGeneratingAll && hasMissing && (
            <button
              onClick={onGenerateMissing}
              disabled={isMasterGeneratingAll}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" /> Missing
            </button>
          )}
          {!isGenerating && !isMasterGeneratingAll && hasFailed && (
            <button
              onClick={onRetryFailed}
              disabled={isMasterGeneratingAll}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold border border-red-400 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> Retry ({failedCount})
            </button>
          )}
          {!isGenerating && !isMasterGeneratingAll && generateCount > 0 && (
            <button
              onClick={onGenerateForModel}
              disabled={isMasterGeneratingAll || sceneImages.length === 0}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${allResults.length > 0 ? 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]' : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]'} disabled:opacity-50`}
            >
              {allResults.length > 0 ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {allResults.length > 0 ? 'Redo' : 'Generate'}
            </button>
          )}
        </div>
      </div>
      {!isCollapsed && (() => {
        const activeScenes = sceneImages
          .map((s, i) => ({ scene: s, index: i }))
          .filter(({ scene }) => scene.action !== 'skip');
        const hasAnyContent = isGenerating || allResults.length > 0 || extras.length > 0 || activeScenes.some(({ index }) => perSceneResults[index]?.length === 0);

        if (!hasAnyContent && activeScenes.length === 0) return null;

        return (
          <>
            <div className="max-h-[280px] overflow-y-auto rounded-lg">
              <div className={`grid gap-1.5 ${isExpanded ? 'grid-cols-5' : 'grid-cols-3'}`}>
                {activeScenes.map(({ scene, index: sceneIdx }) => {
                  const sceneResult = perSceneResults[sceneIdx];
                  const hasResults = sceneResult && sceneResult.length > 0;
                  const isFailed = Array.isArray(sceneResult) && sceneResult.length === 0;
                  const isPending = !sceneResult && isGenerating;
                  const isSceneRegenerating = regeneratingScenes.has(`${model.modelId}:${sceneIdx}`);

                  if (hasResults) {
                    return sceneResult.map((result, ri) => {
                      const selected = isResultSelected(result);
                      const atLimit = !selected && selectedImages.length >= maxImages;
                      const orderIdx = selectedImages.findIndex((e) => e.imageUrl === (result.url || result.gcsUrl) || e.imageId === result.id);
                      return (
                        <button
                          key={`${sceneIdx}-${ri}`}
                          onClick={() => !atLimit && onToggleResult(result)}
                          className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all ${selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                        >
                          <img src={result.url} alt="" className="h-full w-full object-cover" />
                          <div className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white">
                            {sceneIdx + 1}
                          </div>
                          {selected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] font-bold">{orderIdx + 1}</div>
                            </div>
                          )}
                          <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {scene.action === 'generate' && (
                              <div
                                onClick={(e) => { e.stopPropagation(); onRegenerateScene(sceneIdx); }}
                                className="flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer hover:bg-black/70"
                                title="Re-generate"
                              >
                                <RotateCcw className="h-2 w-2" />
                              </div>
                            )}
                            <div
                              onClick={(e) => { e.stopPropagation(); openLibraryForChoosing(sceneIdx); }}
                              className="flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer hover:bg-black/70"
                              title="Choose from library"
                            >
                              <ImageIcon className="h-2 w-2" />
                            </div>
                            <div
                              onClick={(e) => { e.stopPropagation(); onPreview(result.url); }}
                              className="flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer hover:bg-black/70"
                            >
                              <Expand className="h-2 w-2" />
                            </div>
                          </div>
                        </button>
                      );
                    });
                  }

                  if (isFailed) {
                    return (
                      <div
                        key={`failed-${sceneIdx}`}
                        className="group relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-dashed border-red-400/50 bg-[var(--accent)]"
                      >
                        <img src={scene.url} alt="" className="h-full w-full object-cover opacity-20" />
                        <div className="absolute left-0.5 top-0.5 rounded bg-red-500/80 px-1 py-0.5 text-[8px] font-bold text-white">
                          {sceneIdx + 1}
                        </div>
                        <div className="absolute right-0.5 top-0.5 rounded bg-red-500/80 px-1 py-0.5 text-[7px] font-bold text-white">
                          Failed
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                          {isSceneRegenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                          ) : (
                            <>
                              <div
                                onClick={() => onRegenerateScene(sceneIdx)}
                                className={`flex flex-col items-center gap-0.5 rounded-lg bg-black/50 text-white cursor-pointer hover:bg-black/70 transition-colors ${isExpanded ? 'px-1.5 py-1' : 'p-1.5'}`}
                                title="Retry"
                              >
                                <RotateCcw className="h-3 w-3" />
                                {isExpanded && <span className="text-[6px] font-bold">Retry</span>}
                              </div>
                              <div
                                onClick={() => openLibraryForChoosing(sceneIdx)}
                                className={`flex flex-col items-center gap-0.5 rounded-lg bg-black/50 text-white cursor-pointer hover:bg-black/70 transition-colors ${isExpanded ? 'px-1.5 py-1' : 'p-1.5'}`}
                                title="Choose from library"
                              >
                                <ImageIcon className="h-3 w-3" />
                                {isExpanded && <span className="text-[6px] font-bold">Choose</span>}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (isPending || isSceneRegenerating) {
                    return (
                      <div key={`pending-${sceneIdx}`} className="relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-[var(--border)] bg-[var(--accent)]">
                        <img src={scene.url} alt="" className="h-full w-full object-cover opacity-25" />
                        <div className="absolute left-0.5 top-0.5 rounded bg-black/40 px-1 py-0.5 text-[8px] font-bold text-white">
                          {sceneIdx + 1}
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                        </div>
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                      </div>
                    );
                  }

                  if (!sceneResult && !isGenerating && scene.action === 'generate') {
                    return (
                      <div
                        key={`empty-${sceneIdx}`}
                        className="group relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--accent)]"
                      >
                        <img src={scene.url} alt="" className="h-full w-full object-cover opacity-25" />
                        <div className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white">
                          {sceneIdx + 1}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                          <div
                            onClick={() => onRegenerateScene(sceneIdx)}
                            className={`flex flex-col items-center gap-0.5 rounded-lg bg-black/40 text-white cursor-pointer hover:bg-black/60 transition-colors ${isExpanded ? 'px-2 py-1.5' : 'p-1.5'}`}
                            title="Generate"
                          >
                            <Sparkles className={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
                            {isExpanded && <span className="text-[7px] font-semibold">Generate</span>}
                          </div>
                          <div
                            onClick={() => openLibraryForChoosing(sceneIdx)}
                            className={`flex flex-col items-center gap-0.5 rounded-lg bg-black/40 text-white cursor-pointer hover:bg-black/60 transition-colors ${isExpanded ? 'px-2 py-1.5' : 'p-1.5'}`}
                            title="Choose from library"
                          >
                            <ImageIcon className={isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
                            {isExpanded && <span className="text-[7px] font-semibold">Choose</span>}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
                {extras.map((extra, ei) => {
                  const extraSelected = isResultSelected(extra);
                  const extraAtLimit = !extraSelected && selectedImages.length >= maxImages;
                  const extraOrderIdx = selectedImages.findIndex((e) => e.imageUrl === (extra.url || extra.gcsUrl) || e.imageId === extra.id);
                  return (
                    <button
                      key={`extra-${ei}`}
                      onClick={() => !extraAtLimit && onToggleResult(extra)}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all ${extraSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : extraAtLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                    >
                      <img src={extra.url} alt="" className="h-full w-full object-cover" />
                      <div className="absolute left-0.5 top-0.5 rounded bg-purple-600/80 px-1 py-0.5 text-[8px] font-bold text-white">
                        +{ei + 1}
                      </div>
                      {extraSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] font-bold">{extraOrderIdx + 1}</div>
                        </div>
                      )}
                      <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <div
                          onClick={(e) => { e.stopPropagation(); onRemoveExtra(ei); }}
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer hover:bg-red-500/70"
                          title="Remove"
                        >
                          <X className="h-2 w-2" />
                        </div>
                        <div
                          onClick={(e) => { e.stopPropagation(); onPreview(extra.url); }}
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer hover:bg-black/70"
                        >
                          <Expand className="h-2 w-2" />
                        </div>
                      </div>
                    </button>
                  );
                })}
                <div
                  onClick={() => openLibraryForChoosing()}
                  className="relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--accent)] cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-all flex items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-1 text-[var(--text-muted)]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-[var(--border)]">
                      <span className="text-base font-medium leading-none">+</span>
                    </div>
                    <span className="text-[7px] font-medium">Add image</span>
                  </div>
                </div>
              </div>
            </div>
            {isBrowsingLibrary && (
              <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                    Previously Generated {modelLibraryTotal > 0 && `(${modelLibraryTotal})`}
                  </span>
                  <button
                    onClick={onCloseLibrary}
                    className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {choosingForScene && choosingForScene.modelId === model.modelId && (
                  <div className="flex items-center gap-1.5 rounded-md bg-[var(--primary)]/10 px-2 py-1">
                    <ImageIcon className="h-3 w-3 text-[var(--primary)]" />
                    <span className="text-[10px] font-medium text-[var(--primary)]">
                      Pick image for Scene {choosingForScene.sceneIndex + 1}
                    </span>
                    <button
                      onClick={onClearChoosingScene}
                      className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
                {isAddingExtra && !choosingForScene && (
                  <div className="flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-1">
                    <span className="text-[10px] font-medium text-purple-500">
                      Pick an image to add to the carousel
                    </span>
                    <button
                      onClick={onClearAddingExtra}
                      className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
                {modelLibraryLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                    <span className="text-[10px] text-[var(--text-muted)]">Loading...</span>
                  </div>
                ) : modelLibraryImages.length === 0 ? (
                  <div className="py-3 text-center text-[10px] text-[var(--text-muted)]">
                    No previously generated images for this model.
                  </div>
                ) : (
                  <>
                    <div className="max-h-[280px] overflow-y-auto rounded-lg">
                      <div className={`grid gap-1.5 ${isExpanded ? 'grid-cols-5' : 'grid-cols-3'}`}>
                        {modelLibraryImages.map((img) => {
                          const url = img.signedUrl || img.gcsUrl;
                          const libSelected = selectedImages.some((e) => e.imageId === img.id || e.imageUrl === url);
                          const atLimit = !libSelected && selectedImages.length >= maxImages;
                          const orderIdx = selectedImages.findIndex((e) => e.imageId === img.id || e.imageUrl === url);
                          const isChoosingForThisModel = !!(choosingForScene && choosingForScene.modelId === model.modelId);
                          const localIsAddingExtra = isAddingExtra && !isChoosingForThisModel;
                          const isPickMode = isChoosingForThisModel || localIsAddingExtra;
                          return (
                            <button
                              key={img.id}
                              onClick={() => {
                                if (isChoosingForThisModel) {
                                  onChooseLibraryForScene(choosingForScene!.sceneIndex, img);
                                } else if (localIsAddingExtra) {
                                  onAddExtraImage(img);
                                } else if (!atLimit) {
                                  onToggleLibraryImage(img);
                                }
                              }}
                              className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition-all ${
                                isPickMode ? 'border-[var(--border)] hover:border-[var(--primary)] hover:ring-2 hover:ring-[var(--primary)]/20'
                                  : libSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                                  : atLimit ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                                  : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                              }`}
                            >
                              <img src={url} alt={img.filename} className="h-full w-full object-cover" loading="lazy" />
                              {!isPickMode && libSelected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] font-bold">{orderIdx + 1}</div>
                                </div>
                              )}
                              <div
                                onClick={(e) => { e.stopPropagation(); onPreview(url); }}
                                className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                              >
                                <Expand className="h-2 w-2" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {modelLibraryTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onLoadLibraryPage(Math.max(1, modelLibraryPage - 1))}
                          disabled={modelLibraryPage <= 1}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] disabled:opacity-40"
                        >
                          Prev
                        </button>
                        <span className="text-[9px] text-[var(--text-muted)]">{modelLibraryPage} / {modelLibraryTotalPages}</span>
                        <button
                          onClick={() => onLoadLibraryPage(Math.min(modelLibraryTotalPages, modelLibraryPage + 1))}
                          disabled={modelLibraryPage >= modelLibraryTotalPages}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {selectedImages.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">{selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected</p>
                <button onClick={onClearSelection} className="text-[10px] text-red-500 hover:underline">Clear</button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
