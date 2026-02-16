'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Batch } from '@/types';
import { useToast } from '@/hooks/useToast';
import { downloadVideo } from '@/lib/dateUtils';
import Spinner from '@/components/ui/Spinner';
import ProgressBar from '@/components/ui/ProgressBar';
import VideoPreviewModal from '@/components/posts/VideoPreviewModal';

export default function BatchDetailModal({
  open,
  onClose,
  batch,
  loadBatches,
  loadBatchDetail,
}: {
  open: boolean;
  onClose: () => void;
  batch: Batch | null;
  loadBatches: (showLoader?: boolean) => Promise<void>;
  loadBatchDetail: (batchId: string) => Promise<void>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(false);
  const [videoPreview, setVideoPreview] = useState<{ url: string; caption: string } | null>(null);

  if (!open || !batch) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
            <div>
              <h3 className="text-lg font-semibold">{batch.name}</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {batch.model?.name || 'Single image'} · {batch.completedJobs}/{batch.totalJobs} completed
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                batch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                batch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                batch.status === 'partial' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                'bg-[var(--background)] text-[var(--text-muted)]'
              }`}>
                {batch.status}
              </span>
              <button onClick={onClose} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-sm">
                <span>Progress</span>
                <span>{batch.progress || 0}%</span>
              </div>
              <ProgressBar progress={batch.progress || 0} />
            </div>

            <h4 className="mb-3 font-semibold">Videos</h4>
            {batch.jobs?.length === 0 ? (
              <p className="text-[var(--text-muted)]">No videos in this batch</p>
            ) : (
              <div className="space-y-2">
                {batch.jobs?.map((job) => (
                  <div key={job.id} className="flex items-center gap-4 rounded-lg bg-[var(--background)] p-3">
                    {(job.signedUrl || job.outputUrl) ? (
                      <div
                        className="group relative h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-lg"
                        onClick={() => setVideoPreview({
                          url: job.signedUrl || job.outputUrl || '',
                          caption: job.videoSource === 'upload' ? 'Uploaded video' : (job.tiktokUrl || '')
                        })}
                      >
                        <video
                          src={job.signedUrl || job.outputUrl}
                          poster={job.imageUrl || undefined}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="none"
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = 0.1;
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow">
                            <svg className="h-4 w-4 text-[var(--primary)] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-[var(--surface)] text-2xl">🎬</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {job.videoSource === 'upload' ? '📁 Uploaded video' : job.tiktokUrl}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{job.step}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      job.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                      job.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                      'bg-[var(--warning-bg)] text-[var(--warning)]'
                    }`}>
                      {job.status}
                    </span>
                    {job.status === 'completed' && (job.signedUrl || job.outputUrl) && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadVideo(job.signedUrl || job.outputUrl!, `video-${job.id}.mp4`, showToast)}
                          className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface)]"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => {
                            onClose();
                            router.push('/posts?createPost=true&videoUrl=' + encodeURIComponent(job.signedUrl || job.outputUrl!));
                          }}
                          className="rounded border border-[var(--accent-border)] bg-[var(--accent)] px-2 py-1 text-xs"
                        >
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={async () => {
                  setIsRefreshingBatch(true);
                  try {
                    await loadBatchDetail(batch.id);
                  } finally {
                    setIsRefreshingBatch(false);
                  }
                }}
                disabled={isRefreshingBatch}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
              >
                {isRefreshingBatch ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Refreshing...
                  </>
                ) : (
                  'Refresh'
                )}
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Delete this batch? Completed videos will be preserved.')) return;
                  setIsDeletingBatch(true);
                  try {
                    await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' });
                    onClose();
                    loadBatches();
                    showToast('Batch deleted', 'success');
                  } finally {
                    setIsDeletingBatch(false);
                  }
                }}
                disabled={isDeletingBatch}
                className="flex items-center gap-2 rounded-lg border border-[var(--error)] bg-[var(--error-bg)] px-4 py-2 text-sm text-[var(--error)] disabled:opacity-50"
              >
                {isDeletingBatch ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Deleting...
                  </>
                ) : (
                  'Delete Batch'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <VideoPreviewModal video={videoPreview} onClose={() => setVideoPreview(null)} />
    </>
  );
}
