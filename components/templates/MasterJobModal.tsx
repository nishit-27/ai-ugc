'use client';

import { X, Download, ThumbsUp, XCircle, CheckCircle2, Loader2, ExternalLink, RotateCcw, Copy, Pencil, Send, FileEdit } from 'lucide-react';
import type { TemplateJob, MasterConfigModel } from '@/types';

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
  const isBusy = posting || regenerating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            {modelInfo?.primaryImageUrl && (
              <img src={modelInfo.primaryImageUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-[var(--border)]" />
            )}
            <div>
              <div className="text-sm font-semibold">{modelInfo?.modelName || job.name}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                {job.postStatus ? (
                  <span className={`inline-flex items-center gap-0.5 font-semibold ${
                    job.postStatus === 'posted' ? 'text-emerald-500' : 'text-red-400'
                  }`}>
                    {job.postStatus === 'posted' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {job.postStatus === 'posted' ? 'Approved' : 'Rejected'}
                  </span>
                ) : isCompleted ? (
                  'Ready for review'
                ) : isFailed ? (
                  <span className="text-red-400">Failed</span>
                ) : (
                  job.status
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
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--accent)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video */}
        <div className="flex-1 overflow-y-auto">
          {videoUrl && isCompleted ? (
            <div className="relative bg-black">
              <video
                src={videoUrl}
                controls
                autoPlay
                className="mx-auto max-h-[60vh] w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center bg-[var(--background)]">
              {job.status === 'processing' || job.status === 'queued' ? (
                <div className="text-center">
                  <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-[var(--primary)]" />
                  <div className="text-xs text-[var(--text-muted)]">{job.step || 'Processing...'}</div>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">
                  {isFailed ? 'Video generation failed' : 'No video available'}
                </div>
              )}
            </div>
          )}

          {/* Post records — social media links */}
          {postRecords && postRecords.length > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Posted to</div>
              {postRecords.map((pr, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${platformColors[pr.platform] || 'bg-gray-500 text-white'}`}>
                    {platformLabels[pr.platform] || pr.platform}
                  </span>
                  <span className={`text-[10px] font-medium capitalize ${
                    pr.status === 'published' ? 'text-emerald-500' :
                    pr.status === 'failed' ? 'text-red-400' :
                    pr.status === 'scheduled' ? 'text-blue-400' :
                    'text-[var(--text-muted)]'
                  }`}>
                    {pr.status}
                  </span>
                  {pr.platformPostUrl && (
                    <a
                      href={pr.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-border)]/30 transition-colors"
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

        {/* Actions — show for completed or failed jobs */}
        {(isCompleted || isFailed) && (
          <div className="flex items-center gap-2 border-t border-[var(--border)] p-4">
            {videoUrl && isCompleted && (
              <a
                href={videoUrl}
                download
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            )}
            <button
              onClick={onQuickRegenerate}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
              title="Quick regenerate (same settings)"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Regen
            </button>
            <button
              onClick={onEditRegenerate}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
              title="Edit & regenerate (change image/first frame)"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit & Regen
            </button>
            {isCompleted && !job.postStatus && onEditOverrides && (
              <button
                onClick={onEditOverrides}
                disabled={isBusy}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                  hasOverrides
                    ? 'border-master/30 bg-master/5 text-master hover:bg-master/10 dark:text-master-foreground'
                    : 'border-[var(--border)] hover:bg-[var(--accent)]'
                }`}
                title="Edit caption & timing for this video"
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
                  className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/30"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  onClick={onPost}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-master px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
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
                className="flex items-center gap-1.5 rounded-lg bg-master px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
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
