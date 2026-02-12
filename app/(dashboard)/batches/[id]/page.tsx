'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Batch } from '@/types';
import { useToast } from '@/hooks/useToast';
import { downloadVideo } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, Download, Send, Loader2, AlertCircle, CheckCircle2, XCircle, Clock, ArrowLeft, Layers } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal from '@/components/ui/Modal';

const PER_PAGE = 16;
const _cache: Record<string, Batch> = {};

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [batch, setBatch] = useState<Batch | null>(_cache[id] || null);
  const [isLoading, setIsLoading] = useState(!_cache[id]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedJob, setSelectedJob] = useState<NonNullable<Batch['jobs']>[number] | null>(null);
  const [page, setPage] = useState(1);

  const loadBatch = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const res = await fetch(`/api/batches/${id}`, { cache: 'no-store' });
      const data = await res.json();
      _cache[id] = data;
      setBatch(data);
    } catch {
      showToast('Failed to load batch', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    if (!_cache[id]) loadBatch(true);
  }, [id, loadBatch]);

  const jobs = batch?.jobs || [];
  const totalPages = Math.max(1, Math.ceil(jobs.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(
    () => jobs.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [jobs, safePage],
  );

  const liveJob = selectedJob ? jobs.find((j) => j.id === selectedJob.id) ?? selectedJob : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8 text-[var(--primary)]" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="py-20 text-center">
        <h2 className="mb-2 text-xl font-semibold">Batch not found</h2>
        <Link href="/batches" className="text-sm text-[var(--primary)] hover:underline">Back to batches</Link>
      </div>
    );
  }

  const isActive = batch.status === 'pending' || batch.status === 'processing';
  const isCompleted = batch.status === 'completed';
  const isFailed = batch.status === 'failed';
  const isPartial = batch.status === 'partial';
  const progress = batch.totalJobs > 0 ? Math.round((batch.completedJobs / batch.totalJobs) * 100) : 0;
  const pending = batch.totalJobs - batch.completedJobs - batch.failedJobs;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <Link href="/batches" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to batches
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${
              isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
              isFailed ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
              isPartial ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
              'bg-[var(--accent)] text-[var(--text-muted)]'
            }`}>
              {batch.name?.[0]?.toUpperCase() || 'B'}
            </div>
            {batch.model?.avatarUrl && (
              <img
                src={batch.model.avatarUrl}
                alt=""
                className="absolute inset-0 h-full w-full rounded-xl object-cover z-10"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">{batch.name}</h1>
            <p className="text-xs text-[var(--text-muted)]">{batch.model?.name || 'Single image'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            isCompleted ? 'bg-[var(--accent)] text-[var(--text-muted)]' :
            isFailed ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
            isPartial ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
            isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
            'bg-[var(--accent)] text-[var(--text-muted)]'
          }`}>
            {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
            {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
          </span>
          <button
            onClick={() => loadBatch()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              if (!confirm('Delete this batch? Completed videos will be preserved.')) return;
              setIsDeleting(true);
              try {
                await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' });
                showToast('Batch deleted', 'success');
                router.push('/batches');
              } finally {
                setIsDeleting(false);
              }
            }}
            disabled={isDeleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-300 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/30"
          >
            {isDeleting ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Stats + Progress */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--text)]">
            <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            {batch.totalJobs} total
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {batch.completedJobs} done
          </span>
          {batch.failedJobs > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" />
              {batch.failedJobs} failed
            </span>
          )}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              {pending} pending
            </span>
          )}
        </div>
        {isActive && (
          <div className="mt-3">
            <ProgressBar progress={progress} />
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{progress}% complete</div>
          </div>
        )}
      </div>

      {/* Videos grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">Videos ({jobs.length})</h2>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
            No videos in this batch
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              {paginatedJobs.map((job) => {
                const hasVideo = job.status === 'completed' && (job.signedUrl || job.outputUrl);
                const jobActive = job.status === 'queued' || job.status === 'processing';

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`group cursor-pointer overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-lg ${
                      jobActive ? 'ring-1 ring-blue-300' : ''
                    }`}
                  >
                    <div className="relative w-full bg-black/90" style={{ aspectRatio: '9/16' }}>
                      {hasVideo ? (
                        <video
                          src={job.signedUrl || job.outputUrl}
                          className="absolute inset-0 h-full w-full object-contain"
                          muted
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {jobActive ? (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                          ) : job.status === 'failed' ? (
                            <AlertCircle className="h-5 w-5 text-red-400" />
                          ) : (
                            <span className="text-[10px] text-white/40">Queued</span>
                          )}
                        </div>
                      )}
                      <div className="absolute left-1.5 top-1.5">
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                    <div className="bg-[var(--surface)] px-2.5 py-2">
                      <p className="truncate text-xs font-medium">
                        {job.videoSource === 'upload' ? 'Uploaded video' : job.tiktokUrl?.replace('https://www.tiktok.com/', '').slice(0, 30) || 'Video'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{job.step || ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                      p === safePage
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        open={!!liveJob}
        onClose={() => setSelectedJob(null)}
        title={
          liveJob
            ? liveJob.videoSource === 'upload'
              ? 'Uploaded video'
              : liveJob.tiktokUrl?.replace('https://www.tiktok.com/', '').slice(0, 30) || 'Video'
            : 'Job'
        }
        maxWidth="max-w-xs"
      >
        {liveJob && (() => {
          const jobCompleted = liveJob.status === 'completed';
          const jobFailed = liveJob.status === 'failed';
          const jobActive = liveJob.status === 'queued' || liveJob.status === 'processing';
          const videoSrc = liveJob.signedUrl || liveJob.outputUrl;

          return (
            <div className="flex flex-col">
              <div className="relative w-full bg-black" style={{ aspectRatio: '9/16', maxHeight: 600 }}>
                {jobCompleted && videoSrc ? (
                  <video
                    src={videoSrc}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    {jobActive ? (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                        <span className="text-xs text-white/60">{liveJob.step || 'Processing...'}</span>
                      </>
                    ) : jobFailed ? (
                      <>
                        <AlertCircle className="h-6 w-6 text-red-400" />
                        <span className="text-xs text-white/60">Failed</span>
                      </>
                    ) : (
                      <span className="text-xs text-white/40">Queued</span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <StatusBadge status={liveJob.status} />
                  {liveJob.step && <span className="text-[10px] text-[var(--text-muted)] truncate ml-2">{liveJob.step}</span>}
                </div>
                {jobCompleted && videoSrc && (
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={() => downloadVideo(videoSrc!, `video-${liveJob.id}.mp4`, showToast)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setSelectedJob(null);
                        router.push(`/posts?createPost=true&videoUrl=${encodeURIComponent(videoSrc!)}`);
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Create Post
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
