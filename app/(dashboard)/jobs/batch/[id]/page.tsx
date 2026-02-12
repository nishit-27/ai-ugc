'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PipelineBatch, TemplateJob } from '@/types';
import { useToast } from '@/hooks/useToast';
import { RefreshCw, Trash2, Loader2, CheckCircle2, XCircle, Clock, ArrowLeft, Layers } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import ProgressBar from '@/components/ui/ProgressBar';
import TemplateJobList from '@/components/templates/TemplateJobList';

const _cache: Record<string, PipelineBatch & { jobs?: TemplateJob[] }> = {};

export default function PipelineBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [batch, setBatch] = useState<(PipelineBatch & { jobs?: TemplateJob[] }) | null>(_cache[id] || null);
  const [isLoading, setIsLoading] = useState(!_cache[id]);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBatch = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const res = await fetch(`/api/pipeline-batches/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      _cache[id] = data;
      setBatch(data);
    } catch {
      showToast('Failed to load pipeline batch', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadBatch(!_cache[id]);
  }, [id, loadBatch]);

  // Auto-refresh while active (use batch.status only to avoid interval thrashing)
  const batchStatus = batch?.status;
  useEffect(() => {
    const isActive = batchStatus === 'pending' || batchStatus === 'processing';
    if (!isActive) return;

    const interval = setInterval(() => loadBatch(), 3000);
    return () => clearInterval(interval);
  }, [batchStatus, loadBatch]);

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
        <Link href="/jobs?tab=batch" className="text-sm text-[var(--primary)] hover:underline">Back to jobs</Link>
      </div>
    );
  }

  const isActive = batch.status === 'pending' || batch.status === 'processing';
  const isFailed = batch.status === 'failed';
  const isPartial = batch.status === 'partial';
  const progress = batch.totalJobs > 0 ? Math.round((batch.completedJobs / batch.totalJobs) * 100) : 0;
  const pending = batch.totalJobs - batch.completedJobs - batch.failedJobs;
  const childJobs: TemplateJob[] = batch.jobs || [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <Link href="/jobs?tab=batch" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to batch jobs
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
            isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
            isFailed ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
            isPartial ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
            'bg-[var(--accent)] text-[var(--text-muted)]'
          }`}>
            {batch.name?.[0]?.toUpperCase() || 'B'}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">{batch.name}</h1>
            <p className="text-xs text-[var(--text-muted)]">{batch.totalJobs} pipeline run{batch.totalJobs !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            batch.status === 'completed' ? 'bg-[var(--accent)] text-[var(--text-muted)]' :
            isFailed ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
            isPartial ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
            isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
            'bg-[var(--accent)] text-[var(--text-muted)]'
          }`}>
            {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
            {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
          </span>
          <button
            onClick={() => { setIsRefreshing(true); loadBatch(); }}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={async () => {
              if (!confirm('Delete this batch? Child job records will be preserved.')) return;
              setIsDeleting(true);
              try {
                await fetch(`/api/pipeline-batches/${batch.id}`, { method: 'DELETE' });
                showToast('Batch deleted', 'success');
                router.push('/jobs?tab=batch');
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

      {/* Child Jobs */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">Pipeline Runs ({childJobs.length})</h2>
        <TemplateJobList jobs={childJobs} />
      </div>
    </div>
  );
}
