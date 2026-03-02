'use client';

import { useState } from 'react';
import { X, Download, ThumbsUp, XCircle, CheckCircle2, Loader2, ExternalLink, RotateCcw, Copy, Pencil, Send, FileEdit, AlertTriangle, Film, Type, Music, Layers, PlusCircle, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import type { TemplateJob, MasterConfigModel, MiniAppType } from '@/types';

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
  hasOverrides?: boolean;
  posting?: boolean;
  regenerating?: boolean;
  postRecords?: PostRecord[];
}) {
  const videoUrl = job.signedUrl || job.outputUrl;
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isProcessing = job.status === 'processing' || job.status === 'queued';
  const isBusy = posting || regenerating;

  // Carousel detection
  const isCarouselOutput = job.outputUrl?.startsWith('carousel:');
  const carouselUrls = isCarouselOutput
    ? (() => { try { return JSON.parse(job.outputUrl!.slice('carousel:'.length)) as string[]; } catch { return []; } })()
    : [];
  const [carouselIndex, setCarouselIndex] = useState(0);

  const enabledSteps = (job.pipeline || []).filter(s => s.enabled);
  const completedStepIds = new Set((job.stepResults || []).map(r => r.stepId));

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
          {/* Media preview: Carousel images or Video */}
          {isCarouselOutput && isCompleted && carouselUrls.length > 0 ? (
            <div className="relative bg-black">
              {/* Carousel image */}
              <div className="relative mx-auto max-h-[45vh] sm:max-h-[55vh] w-full overflow-hidden">
                <img
                  src={carouselUrls[carouselIndex]}
                  alt={`Slide ${carouselIndex + 1}`}
                  className="mx-auto max-h-[45vh] sm:max-h-[55vh] w-full object-contain"
                />
              </div>

              {/* Prev / Next arrows */}
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

              {/* Slide counter + dots */}
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
          ) : videoUrl && isCompleted && !isCarouselOutput ? (
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
              <div className="space-y-1.5">
                {enabledSteps.map((step, i) => {
                  const isDone = completedStepIds.has(step.id);
                  const isCurrent = isProcessing && i === (job.currentStep || 0);
                  const isStepFailed = isFailed && !isDone && i >= (job.currentStep || 0);
                  const meta = STEP_META[step.type as MiniAppType] || { label: step.type, icon: Film };
                  const Icon = meta.icon;

                  return (
                    <div key={step.id} className="flex items-center gap-2.5">
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
                      <span className={`text-[9px] font-medium ${
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
            <div className="border-t border-neutral-200 bg-white px-4 py-3 space-y-2 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Posted to</div>
              {postRecords.map((pr, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${platformColors[pr.platform] || 'bg-gray-500 text-white'}`}>
                    {platformLabels[pr.platform] || pr.platform}
                  </span>
                  <span className={`text-[10px] font-medium capitalize ${
                    pr.status === 'published' ? 'text-emerald-500' :
                    pr.status === 'failed' ? 'text-red-400' :
                    pr.status === 'scheduled' ? 'text-blue-400' :
                    'text-neutral-500'
                  }`}>
                    {pr.status}
                  </span>
                  {pr.platformPostUrl && (
                    <a
                      href={pr.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      View
                    </a>
                  )}
                </div>
              ))}
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
