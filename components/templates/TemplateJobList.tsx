'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Download, Check, Loader2, AlertCircle, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { TemplateJob, StepResult } from '@/types';
import Spinner from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal from '@/components/ui/Modal';

import { signUrls } from '@/lib/signedUrlClient';

function useSignedUrls(jobs: TemplateJob[]) {
  const [signedMap, setSignedMap] = useState<Record<string, string>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Batch-sign URLs for completed jobs
  useEffect(() => {
    const needSigning = jobs.filter(
      (j) => j.status === 'completed' && j.outputUrl?.includes('storage.googleapis.com') && !signedMap[j.id],
    );
    if (needSigning.length === 0) return;

    let cancelled = false;

    (async () => {
      const urls = needSigning.map((j) => j.outputUrl!);
      const signed = await signUrls(urls);
      if (cancelled || !mountedRef.current) return;
      const updates: Record<string, string> = {};
      for (const j of needSigning) {
        const url = signed.get(j.outputUrl!);
        if (url) updates[j.id] = url;
      }
      if (Object.keys(updates).length > 0) {
        setSignedMap((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [jobs, signedMap]);

  const getSignedUrl = useCallback(
    (job: TemplateJob) => signedMap[job.id] || undefined,
    [signedMap],
  );

  return { getSignedUrl };
}

const stepIcon = (status: 'done' | 'active' | 'pending' | 'disabled') => {
  switch (status) {
    case 'done':     return <Check className="h-3 w-3 text-emerald-500" />;
    case 'active':   return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
    case 'disabled': return <span className="h-3 w-3 rounded-full border border-dashed border-[var(--border)]" />;
    default:         return <span className="h-3 w-3 rounded-full border border-[var(--border)]" />;
  }
};

const PER_PAGE = 16;

export default function TemplateJobList({ jobs, loading }: { jobs: TemplateJob[]; loading?: boolean }) {
  const router = useRouter();
  const [selectedJob, setSelectedJob] = useState<TemplateJob | null>(null);
  const [page, setPage] = useState(1);
  // null = show final output, string = stepId to show
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);
  const { getSignedUrl } = useSignedUrls(jobs);

  // When a job is selected, fetch full signed details (incl. step result URLs)
  const [modalJob, setModalJob] = useState<TemplateJob | null>(null);
  useEffect(() => {
    if (!selectedJob) { setModalJob(null); return; }
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

  const totalPages = Math.max(1, Math.ceil(jobs.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(
    () => jobs.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [jobs, safePage],
  );

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse overflow-hidden rounded-xl shadow-sm">
            <div className="bg-[var(--surface)]" style={{ aspectRatio: '9/16' }}>
              <div className="h-full w-full bg-[var(--background)]" />
            </div>
            <div className="bg-[var(--surface)] px-2.5 py-2 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-[var(--background)]" />
              <div className="h-2.5 w-1/2 rounded bg-[var(--background)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface)] p-8 text-center shadow-sm backdrop-blur-xl">
        <p className="text-[var(--text-muted)]">No pipeline jobs yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {paginatedJobs.map((job) => {
          const isActive = job.status === 'queued' || job.status === 'processing';
          const resolvedUrl = getSignedUrl(job);
          const hasVideo = job.status === 'completed' && job.outputUrl;
          const videoReady = hasVideo && resolvedUrl;
          const progress = job.totalSteps > 0 ? Math.round((job.currentStep / job.totalSteps) * 100) : 0;

          return (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className={`group cursor-pointer overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-lg ${
                isActive ? 'ring-1 ring-blue-300' : ''
              }`}
            >
              {/* Thumbnail — 9:16 */}
              <div
                className="relative w-full bg-black/90"
                style={{ aspectRatio: '9/16' }}
              >
                {videoReady ? (
                  <video
                    src={resolvedUrl}
                    className="absolute inset-0 h-full w-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                  />
                ) : hasVideo && !resolvedUrl ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                    <span className="text-[9px] text-white/40">Loading</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isActive ? (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                    ) : job.status === 'failed' ? (
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    ) : (
                      <span className="text-[10px] text-white/40">Queued</span>
                    )}
                  </div>
                )}

                {/* Status overlay */}
                <div className="absolute left-1.5 top-1.5">
                  <StatusBadge status={job.status} />
                </div>

                {/* Active progress overlay */}
                {isActive && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                    <div className="mb-1 flex items-center gap-1 text-[9px] text-white/80">
                      <Spinner className="h-2.5 w-2.5" />
                      <span className="truncate">{job.step}</span>
                    </div>
                    <ProgressBar progress={progress} size="sm" />
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className="bg-[var(--surface)] px-2.5 py-2">
                <p className="truncate text-xs font-medium">{job.name}</p>
                {job.createdAt && (
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}
                    {new Date(job.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
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
          const finalVideoSrc = getSignedUrl(liveJob) || liveJob.outputUrl;
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
                        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
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
                  {liveJob.createdAt && (
                    <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                      {new Date(liveJob.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                      {new Date(liveJob.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
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
                              backgroundColor: isViewing ? 'rgba(255,255,255,0.2)' : st === 'done' ? 'rgba(34,197,94,0.15)' : st === 'active' ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.05)',
                              color: isViewing ? 'white' : st === 'done' ? '#22c55e' : st === 'active' ? '#3b82f6' : 'var(--text-muted)',
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
