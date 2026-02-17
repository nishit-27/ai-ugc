'use client';

import { Loader2, CheckCircle2, XCircle, AlertCircle, Check, ThumbsUp, ThumbsDown, RotateCcw, Copy, Pencil, Send, FileEdit } from 'lucide-react';
import type { TemplateJob } from '@/types';

export default function MasterJobCard({
  job,
  modelName,
  modelImageUrl,
  isSelected,
  onToggle,
  onClick,
  onApprove,
  onReject,
  onRepost,
  onQuickRegenerate,
  onEditRegenerate,
  onEditOverrides,
  hasOverrides,
  isApproving,
  isRejecting,
  isRegenerating,
}: {
  job: TemplateJob;
  modelName?: string;
  modelImageUrl?: string;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRepost?: () => void;
  onQuickRegenerate?: () => void;
  onEditRegenerate?: () => void;
  onEditOverrides?: () => void;
  hasOverrides?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  isRegenerating?: boolean;
}) {
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isProcessing = job.status === 'processing' || job.status === 'queued';
  const hasOutput = !!job.outputUrl || !!job.signedUrl;
  const canAct = isCompleted && !job.postStatus;
  const canRepost = isCompleted && job.postStatus === 'posted';
  const canRegenerate = (isCompleted || isFailed) && !isProcessing;
  const isBusy = isApproving || isRejecting || isRegenerating;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all ${
        job.postStatus === 'posted' ? 'border-emerald-400 dark:border-emerald-700' :
        job.postStatus === 'rejected' ? 'border-red-300 dark:border-red-800' :
        isSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' :
        isFailed ? 'border-red-200 dark:border-red-900/40' :
        'border-[var(--border)] hover:border-[var(--primary)]/50'
      } bg-[var(--surface)]`}
    >
      {/* Selection checkbox */}
      {canAct && !isBusy && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all ${
            isSelected
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-white/60 bg-black/30 text-transparent hover:border-white'
          }`}
        >
          <Check className="h-3 w-3" />
        </button>
      )}

      {/* Post status badge */}
      {job.postStatus && (
        <div className={`absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          job.postStatus === 'posted'
            ? 'bg-emerald-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {job.postStatus === 'posted' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
          {job.postStatus === 'posted' ? 'Approved' : 'Rejected'}
        </div>
      )}

      {/* Custom overrides badge */}
      {hasOverrides && !job.postStatus && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-master/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <FileEdit className="h-2.5 w-2.5" />
          Custom
        </div>
      )}

      {/* Regenerated badge */}
      {job.regeneratedFrom && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-blue-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Copy className="h-2.5 w-2.5" />
          Regen
        </div>
      )}

      {/* Loading overlay when approving/rejecting/regenerating */}
      {isBusy && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
            <span className="text-[10px] font-medium text-white">
              {isApproving ? 'Approving...' : isRejecting ? 'Rejecting...' : 'Regenerating...'}
            </span>
          </div>
        </div>
      )}

      {/* Video thumbnail / status */}
      <div
        className="relative aspect-[9/16] w-full cursor-pointer bg-[var(--background)]"
        onClick={onClick}
      >
        {hasOutput && isCompleted ? (
          <video
            src={job.signedUrl || job.outputUrl}
            className="h-full w-full object-cover"
            muted
            preload="none"
            onMouseEnter={(e) => { try { (e.target as HTMLVideoElement).play(); } catch {} }}
            onMouseLeave={(e) => { try { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; } catch {} }}
          />
        ) : isProcessing ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-3">
            <Loader2 className="h-6 w-6 animate-spin text-master dark:text-master-foreground" />
            <div className="text-[10px] text-[var(--text-muted)] text-center leading-tight">{job.step || 'Processing...'}</div>
          </div>
        ) : isFailed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <div className="text-[10px] text-red-400">Failed</div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-[10px] text-[var(--text-muted)]">Queued</div>
          </div>
        )}
      </div>

      {/* Footer: model info + actions */}
      <div className="border-t border-[var(--border)] px-2.5 py-2">
        <div className="flex items-center gap-2">
          {modelImageUrl && (
            <img
              src={modelImageUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full object-cover border border-[var(--border)]"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium leading-tight">{modelName || job.name}</div>
            {job.createdBy && (
              <div className="text-[9px] text-[var(--text-muted)]">By {job.createdBy}</div>
            )}
            <div className="flex items-center gap-1 mt-0.5">
              {job.postStatus === 'posted' ? (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Approved</span>
                </>
              ) : job.postStatus === 'rejected' ? (
                <>
                  <XCircle className="h-2.5 w-2.5 text-red-400" />
                  <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">Rejected</span>
                </>
              ) : (
                <>
                  {isCompleted && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />}
                  {isFailed && <XCircle className="h-2.5 w-2.5 text-red-400" />}
                  {isProcessing && <Loader2 className="h-2.5 w-2.5 animate-spin text-master dark:text-master-foreground" />}
                  <span className="text-[10px] text-[var(--text-muted)] capitalize">{job.status}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Action buttons row */}
        {(canAct || canRepost || canRegenerate) && !isBusy && (
          <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-[var(--border)]">
            {isCompleted && !job.postStatus && onEditOverrides && (
              <button
                onClick={(e) => { e.stopPropagation(); onEditOverrides(); }}
                className={`flex h-6 items-center justify-center gap-1 rounded-md transition-colors text-[10px] font-medium px-2 ${
                  hasOverrides
                    ? 'bg-master/10 text-master dark:text-master-foreground hover:bg-master/20'
                    : 'bg-[var(--accent)] text-[var(--text-muted)] hover:bg-master/10 hover:text-master dark:hover:text-master-foreground'
                }`}
                title="Edit caption & timing for this video"
              >
                <FileEdit className="h-3 w-3" />
              </button>
            )}
            {canRegenerate && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickRegenerate?.(); }}
                  className="flex h-6 items-center justify-center gap-1 rounded-md bg-[var(--accent)] text-[var(--text-muted)] transition-colors hover:bg-master/10 hover:text-master dark:hover:text-master-foreground text-[10px] font-medium px-2"
                  title="Quick regenerate (same settings)"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditRegenerate?.(); }}
                  className="flex h-6 items-center justify-center gap-1 rounded-md bg-[var(--accent)] text-[var(--text-muted)] transition-colors hover:bg-master/10 hover:text-master dark:hover:text-master-foreground text-[10px] font-medium px-2"
                  title="Edit & regenerate (change image/first frame)"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  <RotateCcw className="h-2.5 w-2.5" />
                </button>
              </>
            )}
            {canAct && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onApprove?.(); }}
                  className="flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 text-[10px] font-medium"
                  title="Approve & Post"
                >
                  <ThumbsUp className="h-3 w-3" />
                  Approve
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onReject?.(); }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-500 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                  title="Reject"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </>
            )}
            {canRepost && onRepost && (
              <button
                onClick={(e) => { e.stopPropagation(); onRepost(); }}
                className="flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-master/10 text-master transition-colors hover:bg-master/20 dark:text-master-foreground text-[10px] font-medium"
                title="Repost to social accounts"
              >
                <Send className="h-3 w-3" />
                Repost
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
