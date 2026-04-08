'use client';

import { useState } from 'react';
import { X, Download, ThumbsUp, XCircle, CheckCircle2, Loader2, ExternalLink, RotateCcw, Copy, Pencil, Send, FileEdit, AlertTriangle, Film, Type, Music, Layers, PlusCircle, ChevronLeft, ChevronRight, Image as ImageIcon, Play, Eye } from 'lucide-react';
import type { TemplateJob, MasterConfigModel, MiniAppType, StepResult } from '@/types';
import { deriveTemplateJobStepState } from '@/lib/templateJobState';

type PostRecord = {
  platform: string;
  status: string;
  platformPostUrl?: string;
  latePostId?: string;
};

const platformLabels: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: 'Twitter',
  facebook: 'Facebook',
};

const platformColors: Record<string, string> = {
  tiktok: 'bg-black text-white',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  youtube: 'bg-red-600 text-white',
  twitter: 'bg-sky-500 text-white',
  facebook: 'bg-blue-600 text-white',
};

const STEP_META: Record<string, { label: string; icon: typeof Film }> = {
  'video-generation': { label: 'Video Generation', icon: Film },
  'batch-video-generation': { label: 'Batch Video Gen', icon: Film },
  'text-overlay': { label: 'Text Overlay', icon: Type },
  'bg-music': { label: 'Background Music', icon: Music },
  'attach-video': { label: 'Attach Video', icon: PlusCircle },
  'compose': { label: 'Compose', icon: Layers },
  'carousel': { label: 'Carousel', icon: ImageIcon },
};

export default function MasterJobModal({
  job,
  modelInfo,
  onClose,
  onPost,
  onRepost,
  onReject,
  onQuickRegenerate,
  onEditRegenerate,
  onEditOverrides,
  onRegenStep,
  hasOverrides,
  posting,
  regenerating,
  postRecords,
}: {
  job: TemplateJob;
  modelInfo?: MasterConfigModel;
  onClose: () => void;
  onPost: () => void;
  onRepost?: () => void;
  onReject: () => void;
  onQuickRegenerate?: () => void;
  onEditRegenerate?: () => void;
  onEditOverrides?: () => void;
  onRegenStep?: (stepIndex: number) => void;
  hasOverrides?: boolean;
  posting?: boolean;
  regenerating?: boolean;
  postRecords?: PostRecord[];
}) {
  const videoUrl = job.signedUrl || job.outputUrl;
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isQueued = job.status === 'queued';
  const isProcessing = job.status === 'processing';
  const isBusy = posting || regenerating;

  // Carousel detection
  const isCarouselOutput = job.outputUrl?.startsWith('carousel:');
  const carouselUrls = isCarouselOutput
    ? (() => { try { return JSON.parse(job.outputUrl!.slice('carousel:'.length)) as string[]; } catch { return []; } })()
    : [];
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Step viewing state: null = final output, stepId = viewing that step's result
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);

  const {
    enabledSteps,
    normalizedStepResults,
    completedStepIds,
    activeStepIndex,
    failedStepIndex,
  } = deriveTemplateJobStepState(job);
  const stepResultMap = new Map<string, StepResult>(normalizedStepResults.map(r => [r.stepId, r]));

  // Get the URL to display based on viewingStepId
  const viewingResult = viewingStepId ? stepResultMap.get(viewingStepId) : null;
  const displayVideoUrl = viewingResult ? (viewingResult.signedUrl || viewingResult.outputUrl) : videoUrl;
  const isViewingStep = viewingStepId !== null;
  const viewingStepIsVideo = viewingResult && !viewingResult.isCarousel && viewingResult.outputUrl && !viewingResult.outputUrl.startsWith('carousel:');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[95vh] sm:max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-2.5 min-w-0">
            {modelInfo?.primaryImageUrl && (
              <img src={modelInfo.primaryImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-neutral-200 dark:ring-neutral-700" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">{modelInfo?.modelName || job.name}</div>
              <div className="flex items-center gap-1.5 text-[10px]">
                {job.postStatus ? (
                  <span className={`inline-flex items-center gap-0.5 font-semibold ${
                    job.postStatus === 'posted' ? 'text-emerald-500' : 'text-red-400'
                  }`}>
                    {job.postStatus === 'posted' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {job.postStatus === 'posted' ? 'Approved' : 'Rejected'}
                  </span>
                ) : isCompleted ? (
                  <span className="text-neutral-500">Ready for review</span>
                ) : isFailed ? (
                  <span className="text-red-400">Failed</span>
                ) : (
                  <span className="text-neutral-500">{job.status}</span>
                )}
                {job.regeneratedFrom && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500">
                    <Copy className="h-2.5 w-2.5" />
                    Regenerated
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
          {/* Media preview: Carousel images, step result, or final video */}
          {/* Step viewing badge */}
          {isViewingStep && viewingResult && (
            <div className="flex items-center justify-between bg-blue-50 px-4 py-1.5 dark:bg-blue-950/30">
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Viewing: {viewingResult.label}
              </span>
              <button
                onClick={() => setViewingStepId(null)}
                className="text-[10px] font-medium text-blue-500 hover:text-blue-700 underline"
              >
                Back to final
              </button>
            </div>
          )}
          {isCarouselOutput && isCompleted && carouselUrls.length > 0 && !isViewingStep ? (
            <div className="relative bg-black">
              <div className="relative mx-auto max-h-[45vh] sm:max-h-[55vh] w-full overflow-hidden">
                <img
                  src={carouselUrls[carouselIndex]}
                  alt={`Slide ${carouselIndex + 1}`}
                  className="mx-auto max-h-[45vh] sm:max-h-[55vh] w-full object-contain"
                />
              </div>
              {carouselUrls.length > 1 && (
                <>
                  <button
                    onClick={() => setCarouselIndex((i) => (i - 1 + carouselUrls.length) % carouselUrls.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setCarouselIndex((i) => (i + 1) % carouselUrls.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-semibold text-white">
                  {carouselIndex + 1} / {carouselUrls.length}
                </span>
                {carouselUrls.length <= 10 && (
                  <div className="flex items-center gap-1">
                    {carouselUrls.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={`h-1.5 rounded-full transition-all ${
                          i === carouselIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (isViewingStep && viewingStepIsVideo && displayVideoUrl) ? (
            <div className="bg-black">
              <video
                key={displayVideoUrl}
                src={displayVideoUrl}
                controls
                autoPlay
                className="mx-auto max-h-[45vh] sm:max-h-[55vh] w-full object-contain"
              />
            </div>
          ) : (!isViewingStep && videoUrl && isCompleted && !isCarouselOutput) ? (
            <div className="bg-black">
              <video
                src={videoUrl}
                controls
                autoPlay
                className="mx-auto max-h-[45vh] sm:max-h-[55vh] w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              {isProcessing ? (
                <div className="text-center">
                  <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-master-foreground" />
                  <div className="text-xs text-neutral-500">{job.step || 'Processing...'}</div>
                </div>
              ) : isQueued ? (
                <div className="text-sm text-neutral-500">Queued</div>
              ) : (
                <div className="text-sm text-neutral-500">
                  {isFailed ? (isCarouselOutput ? 'Carousel generation failed' : 'Video generation failed') : 'No media available'}
                </div>
              )}
            </div>
          )}

          {/* Failed reason */}
          {isFailed && job.error && (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div>
                <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">Error</div>
                <div className="text-[11px] text-red-600/80 dark:text-red-400/80 leading-snug mt-0.5">{job.error}</div>
              </div>
            </div>
          )}

          {/* Pipeline steps */}
          {enabledSteps.length > 0 && (
            <div className="border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900 mt-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Pipeline Steps</div>
              <div className="space-y-1">
                {enabledSteps.map((step, i) => {
                  const isDone = completedStepIds.has(step.id);
                  const isCurrent = isProcessing && i === activeStepIndex;
                  const isStepFailed = isFailed && i === failedStepIndex;
                  const meta = STEP_META[step.type as MiniAppType] || { label: step.type, icon: Film };
                  const Icon = meta.icon;
                  const stepResult = stepResultMap.get(step.id);
                  const hasResult = !!stepResult;
                  const isViewing = viewingStepId === step.id;
                  const hasPriorResults = i === 0 || enabledSteps.slice(0, i).every((prevStep) => completedStepIds.has(prevStep.id));
                  const canRegen = (isCompleted || isFailed || isQueued) && !isBusy && job.status !== 'processing' && !!onRegenStep && hasPriorResults;

                  return (
                    <div
                      key={step.id}
                      className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                        isViewing ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      }`}
                    >
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        isDone ? 'bg-emerald-100 dark:bg-emerald-950/40' :
                        isCurrent ? 'bg-master/10' :
                        isStepFailed ? 'bg-red-100 dark:bg-red-950/30' :
                        'bg-neutral-100 dark:bg-neutral-800'
                      }`}>
                        {isDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : isCurrent ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-master dark:text-master-foreground" />
                        ) : isStepFailed ? (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        ) : (
                          <Icon className="h-3.5 w-3.5 text-neutral-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[11px] font-medium ${
                          isDone ? 'text-emerald-600 dark:text-emerald-400' :
                          isCurrent ? 'text-neutral-900 dark:text-neutral-100' :
                          isStepFailed ? 'text-red-500 dark:text-red-400' :
                          'text-neutral-400'
                        }`}>
                          {meta.label}
                        </span>
                      </div>
                      {/* Step action buttons — always visible */}
                      {(hasResult || canRegen) && (
                        <div className="flex items-center gap-1">
                          {hasResult && (
                            <button
                              onClick={() => setViewingStepId(isViewing ? null : step.id)}
                              title={isViewing ? 'Back to final' : `View ${meta.label} result`}
                              className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors ${
                                isViewing
                                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                              }`}
                            >
                              <Eye className="h-3 w-3" />
                              <span>{isViewing ? 'Viewing' : 'View'}</span>
                            </button>
                          )}
                          {hasResult && (
                            <a
                              href={stepResult.signedUrl || stepResult.outputUrl}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Download ${meta.label} result`}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                            >
                              <Download className="h-3 w-3" />
                            </a>
                          )}
                          {canRegen && (
                            <button
                              onClick={() => onRegenStep(i)}
                              disabled={isBusy}
                              title={`Regen from ${meta.label}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <span className={`text-[9px] font-medium shrink-0 ${
                        isDone ? 'text-emerald-500' :
                        isCurrent ? 'text-master dark:text-master-foreground' :
                        isStepFailed ? 'text-red-400' :
                        'text-neutral-300 dark:text-neutral-600'
                      }`}>
                        {isDone ? 'Done' : isCurrent ? 'Running' : isStepFailed ? 'Failed' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post records */}
          {postRecords && postRecords.length > 0 && (
            <div className="border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Posted to</div>
              <div className="flex flex-wrap items-center gap-2">
                {postRecords.map((pr, i) => {
                  const statusColor =
                    pr.status === 'published' ? 'text-emerald-500' :
                    pr.status === 'failed' ? 'text-red-400' :
                    pr.status === 'scheduled' ? 'text-blue-400' :
                    'text-neutral-500';
                  const inner = (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                      {pr.platform === 'tiktok' ? (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>
                      ) : pr.platform === 'youtube' ? (
                        <svg className="h-3.5 w-3.5 text-red-600" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      ) : pr.platform === 'instagram' ? (
                        <svg className="h-3.5 w-3.5 text-pink-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                      ) : pr.platform === 'twitter' ? (
                        <svg className="h-3.5 w-3.5 text-sky-500" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      ) : pr.platform === 'facebook' ? (
                        <svg className="h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
                      )}
                      <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">{platformLabels[pr.platform] || pr.platform}</span>
                      <span className={`text-[10px] font-medium capitalize ${statusColor}`}>{pr.status}</span>
                      {pr.platformPostUrl && <ExternalLink className="h-2.5 w-2.5 text-neutral-400" />}
                    </span>
                  );
                  return pr.platformPostUrl ? (
                    <a key={i} href={pr.platformPostUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">{inner}</a>
                  ) : (
                    <span key={i}>{inner}</span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {(isCompleted || isFailed) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-white p-3 sm:p-3.5 dark:border-neutral-700 dark:bg-neutral-900">
            {isCompleted && isCarouselOutput && carouselUrls.length > 0 && (
              <a
                href={carouselUrls[carouselIndex]}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 sm:px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-750"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Slide {carouselIndex + 1}</span>
              </a>
            )}
            {isCompleted && !isCarouselOutput && videoUrl && (
              <a
                href={videoUrl}
                download
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 sm:px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-750"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <button
              onClick={onQuickRegenerate}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 sm:px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              <span className="hidden xs:inline">Regen</span>
            </button>
            <button
              onClick={onEditRegenerate}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 sm:px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit &</span> Regen
            </button>
            {isCompleted && !job.postStatus && onEditOverrides && (
              <button
                onClick={onEditOverrides}
                disabled={isBusy}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  hasOverrides
                    ? 'border-master bg-master/10 text-master-foreground'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                }`}
              >
                <FileEdit className="h-3.5 w-3.5" />
                {hasOverrides ? 'Custom' : 'Caption'}
              </button>
            )}
            <div className="flex-1" />
            {isCompleted && !job.postStatus && (
              <>
                <button
                  onClick={onReject}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 sm:px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-neutral-800 dark:hover:bg-red-950/30"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reject</span>
                </button>
                <button
                  onClick={onPost}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-master px-3 sm:px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                  Approve
                </button>
              </>
            )}
            {isCompleted && job.postStatus === 'posted' && onRepost && (
              <button
                onClick={onRepost}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-lg bg-master px-3 sm:px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
              >
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Repost
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
