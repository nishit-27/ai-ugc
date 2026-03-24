'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Download, Check, Loader2, AlertCircle, ChevronLeft, ChevronRight, Play, Trash2 } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { TemplateJob, StepResult } from '@/types';
import Spinner from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal from '@/components/ui/Modal';
import LoadingShimmer from '@/components/ui/LoadingShimmer';

gsap.registerPlugin(useGSAP);

function SkeletonCard() {
  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <LoadingShimmer />
    </div>
  );
}

function useResolvedUrls() {
  const getSignedUrl = useCallback(
    (job: TemplateJob) => job.signedUrl || job.outputUrl || undefined,
    [],
  );
  return { getSignedUrl };
}

const PER_PAGE = 16;

export default function TemplateJobList({ jobs, loading }: { jobs: TemplateJob[]; loading?: boolean }) {
  const router = useRouter();
  const [selectedJob, setSelectedJob] = useState<TemplateJob | null>(null);
  const [page, setPage] = useState(1);
  const [loadedById, setLoadedById] = useState<Record<string, true>>({});
  const [deletingQueuedIds, setDeletingQueuedIds] = useState<Record<string, true>>({});
  const [hiddenJobIds, setHiddenJobIds] = useState<Record<string, true>>({});
  // null = show final output, string = stepId to show
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);
  const { getSignedUrl } = useResolvedUrls();

  const markLoaded = (id: string) => {
    setLoadedById((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  // When a job is selected, fetch full signed details (incl. step result URLs)
  const [modalJob, setModalJob] = useState<TemplateJob | null>(null);
  useEffect(() => {
    if (!selectedJob) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${selectedJob.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setModalJob(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep modal in sync with live polling data, prefer modalJob (has signed URLs)
  const polledJob = selectedJob ? jobs.find((j) => j.id === selectedJob.id) : null;
  const liveJob = modalJob && modalJob.id === selectedJob?.id ? modalJob : polledJob ?? selectedJob;

  const visibleJobs = useMemo(
    () => jobs.filter((job) => !hiddenJobIds[job.id]),
    [jobs, hiddenJobIds],
  );

  const totalPages = Math.max(1, Math.ceil(visibleJobs.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(
    () => visibleJobs.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [visibleJobs, safePage],
  );

  const handleDeleteQueued = useCallback(async (jobId: string) => {
    setDeletingQueuedIds((prev) => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch(`/api/templates/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete queued job');
      }
      setHiddenJobIds((prev) => ({ ...prev, [jobId]: true }));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setModalJob(null);
        setViewingStepId(null);
      }
    } catch (error) {
      console.error('Failed to delete queued job:', error);
    } finally {
      setDeletingQueuedIds((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  }, [selectedJob]);

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (visibleJobs.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface)] p-8 text-center shadow-sm backdrop-blur-xl">
        <p className="text-[var(--text-muted)]">No pipeline jobs yet</p>
      </div>
    );
  }

  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!gridRef.current || paginatedJobs.length === 0) return;
    const cards = gridRef.current.querySelectorAll(':scope > div');
    if (!cards.length) return;
    gsap.fromTo(cards,
      { autoAlpha: 0, y: 20 },
      { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.035, ease: 'power2.out' }
    );
  }, { scope: gridRef, dependencies: [paginatedJobs] });

  return (
    <>
      <div ref={gridRef} className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {paginatedJobs.map((job) => {
          const isActive = job.status === 'queued' || job.status === 'processing';
          const isFailedCard = job.status === 'failed';
          const isQueued = job.status === 'queued';
          const isDeletingQueued = !!deletingQueuedIds[job.id];
          const resolvedUrl = getSignedUrl(job);
          const hasVideo = job.status === 'completed' && !!(job.signedUrl || job.outputUrl);
          const videoReady = hasVideo && resolvedUrl;
          const progress = job.totalSteps > 0 ? Math.round((job.currentStep / job.totalSteps) * 100) : 0;
          const isLoaded = !!loadedById[job.id];

          return (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className={`group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-lg ${
                isActive ? 'ring-1 ring-[var(--primary)]/50' : ''
              }`}
            >
              {/* Thumbnail — 9:16 */}
              <div
                className="relative w-full overflow-hidden bg-[var(--accent)]"
                style={{ aspectRatio: '9/16' }}
              >
                {videoReady ? (
                  <>
                    <video
                      src={resolvedUrl}
                      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={() => markLoaded(job.id)}
                      onError={() => markLoaded(job.id)}
                    />
                    {!isLoaded && <LoadingShimmer />}
                  </>
                ) : isFailedCard ? (
                  <>
                    <div className="absolute inset-0 bg-black/85" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 text-red-500/90" />
                    </div>
                  </>
                ) : hasVideo && !resolvedUrl ? (
                  <LoadingShimmer />
                ) : (
                  <>
                    <LoadingShimmer />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isActive ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
                      ) : (
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">Queued</span>
                      )}
                    </div>
                  </>
                )}

                {/* Status overlay */}
                <div className="absolute left-1.5 top-1.5">
                  <StatusBadge status={job.status} />
                </div>
                {isQueued && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteQueued(job.id);
                    }}
                    disabled={isDeletingQueued}
                    className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label="Delete queued job"
                  >
                    {isDeletingQueued ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-2 pb-1.5 pt-8">
                  {isActive && (
                    <div className="mb-1.5">
                      <div className="mb-1 flex items-center gap-1 text-[9px] text-white/85">
                        <Spinner className="h-2.5 w-2.5" />
                        <span className="truncate">{job.step}</span>
                      </div>
                      <ProgressBar progress={progress} size="sm" />
                    </div>
                  )}
                  <p className="truncate text-[11px] font-medium text-white/95">{job.name}</p>
                  <p className="truncate text-[10px] text-white/75">
                    {job.createdAt && (
                      <>
                        {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}
                        {new Date(job.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </>
                    )}
                  </p>
                  <p className="truncate text-[10px] text-white/68">
                    By {job.createdBy || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs">Prev</span>
          </button>
          {(() => {
            const pages: (number | '...')[] = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (safePage > 3) pages.push('...');
              const start = Math.max(2, safePage - 1);
              const end = Math.min(totalPages - 1, safePage + 1);
              for (let i = start; i <= end; i++) pages.push(i);
              if (safePage < totalPages - 2) pages.push('...');
              pages.push(totalPages);
            }
            return pages.map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="flex h-8 w-6 items-center justify-center text-xs text-[var(--text-muted)]">...</span>
              ) : (
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
              )
            );
          })()}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="text-xs">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs text-[var(--text-muted)]">Page {safePage} of {totalPages}</span>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        open={!!liveJob}
        onClose={() => { setSelectedJob(null); setModalJob(null); setViewingStepId(null); }}
        title={liveJob?.name || 'Job'}
        maxWidth="max-w-sm"
      >
        {liveJob && (() => {
          const isActive = liveJob.status === 'queued' || liveJob.status === 'processing';
          const isFailed = liveJob.status === 'failed';
          const isCompleted = liveJob.status === 'completed';
          const enabledSteps = liveJob.pipeline.filter((s) => s.enabled);
          const completedSteps = isCompleted
            ? enabledSteps.length
            : Math.min(liveJob.currentStep, enabledSteps.length);
          const progress = enabledSteps.length > 0
            ? Math.round((completedSteps / enabledSteps.length) * 100)
            : 0;
          const finalVideoSrc = liveJob.signedUrl || getSignedUrl(liveJob) || liveJob.outputUrl;
          const stepResults: StepResult[] = liveJob.stepResults || [];

          // Determine which video to show
          let activeVideoSrc: string | undefined;
          let activeLabel = 'Final Output';
          if (viewingStepId === null) {
            activeVideoSrc = finalVideoSrc;
          } else {
            const sr = stepResults.find((r) => r.stepId === viewingStepId);
            if (sr) {
              activeVideoSrc = sr.signedUrl || sr.outputUrl;
              activeLabel = sr.label;
            }
          }

          return (
            <div className="flex flex-col">
              {/* ── Video / Placeholder (9:16) ── */}
              <div
                className="relative w-full bg-black"
                style={{ aspectRatio: '9/16', maxHeight: 520 }}
              >
                {activeVideoSrc ? (
                  <video
                    key={activeVideoSrc}
                    src={activeVideoSrc}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    {isActive ? (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                        <span className="text-xs text-white/60">{liveJob.step || 'Processing...'}</span>
                      </>
                    ) : isFailed ? (
                      <>
                        <AlertCircle className="h-6 w-6 text-red-400" />
                        <span className="text-xs text-white/60">Failed</span>
                      </>
                    ) : (
                      <span className="text-xs text-white/40">Queued</span>
                    )}
                  </div>
                )}

                {/* Currently viewing label */}
                {activeVideoSrc && (
                  <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                    {activeLabel}
                  </div>
                )}
              </div>

              {/* ── Info section ── */}
              <div className="p-3 space-y-2.5">
                {/* Status + date row */}
                <div className="flex items-center justify-between">
                  <StatusBadge status={liveJob.status} />
                  <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                    {liveJob.createdAt && (
                      <>
                        {new Date(liveJob.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                        {new Date(liveJob.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </>
                    )}
                    {liveJob.createdBy && <> &middot; By {liveJob.createdBy}</>}
                  </span>
                </div>

                {/* Progress */}
                {enabledSteps.length > 0 && !isCompleted && (
                  <div>
                    <ProgressBar progress={progress} />
                    <div className="mt-1 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {completedSteps} of {enabledSteps.length} steps
                    </div>
                  </div>
                )}

                {/* ── Step results selector ── */}
                <div className="space-y-1">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Pipeline Steps</div>
                  <div className="flex flex-col gap-1">
                    {liveJob.pipeline.map((step, i) => {
                      if (!step.enabled) return null;
                      let st: 'done' | 'active' | 'pending' = 'pending';
                      if (i < liveJob.currentStep || isCompleted) st = 'done';
                      else if (i === liveJob.currentStep && liveJob.status === 'processing') st = 'active';

                      const hasResult = stepResults.some((r) => r.stepId === step.id);
                      const isViewing = viewingStepId === step.id;

                      return (
                        <button
                          key={step.id}
                          onClick={() => hasResult ? setViewingStepId(isViewing ? null : step.id) : undefined}
                          disabled={!hasResult}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-all ${
                            isViewing
                              ? 'bg-[var(--primary)] text-white shadow-sm'
                              : hasResult
                                ? 'bg-[var(--accent)] text-[var(--text)] hover:bg-[var(--primary)]/10 cursor-pointer'
                                : 'bg-[var(--accent)] text-[var(--text-muted)] opacity-60 cursor-default'
                          }`}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                            style={{
                              backgroundColor: isViewing ? 'rgba(255,255,255,0.2)' : st === 'done' ? 'rgba(34,197,94,0.15)' : st === 'active' ? 'var(--accent)' : 'rgba(0,0,0,0.05)',
                              color: isViewing ? 'white' : st === 'done' ? '#22c55e' : st === 'active' ? 'var(--primary)' : 'var(--text-muted)',
                            }}
                          >
                            {st === 'done' ? <Check className="h-3 w-3" /> : st === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                          </span>
                          <span className="flex-1 capitalize truncate">{step.type.replace(/-/g, ' ')}</span>
                          {hasResult && (
                            <Play className={`h-3 w-3 shrink-0 ${isViewing ? 'text-white' : 'text-[var(--text-muted)]'}`} />
                          )}
                        </button>
                      );
                    })}

                    {/* Final output button */}
                    {isCompleted && finalVideoSrc && (
                      <button
                        onClick={() => setViewingStepId(null)}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-medium transition-all ${
                          viewingStepId === null
                            ? 'bg-[var(--primary)] text-white shadow-sm'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
                        }`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: viewingStepId === null ? 'rgba(255,255,255,0.2)' : 'rgba(34,197,94,0.15)' }}
                        >
                          <Play className={`h-3 w-3 ${viewingStepId === null ? 'text-white' : 'text-emerald-500'}`} />
                        </span>
                        <span className="flex-1">Final Output</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Error */}
                {isFailed && liveJob.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{liveJob.error}</span>
                  </div>
                )}

                {/* Action buttons */}
                {isCompleted && activeVideoSrc && (
                  <div className="flex gap-2 pt-0.5">
                    <a
                      href={activeVideoSrc}
                      download
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                    {viewingStepId === null && (
                      <button
                        onClick={() => {
                          setSelectedJob(null);
                          setViewingStepId(null);
                          router.push(`/posts?createPost=true&videoUrl=${encodeURIComponent(activeVideoSrc!)}`);
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Create Post
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
