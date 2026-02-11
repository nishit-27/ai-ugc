'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { PipelineBatch } from '@/types';
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Layers, ChevronRight as Arrow } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar';

const PER_PAGE = 12;

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function PipelineBatchList({
  batches,
  loading,
}: {
  batches: PipelineBatch[];
  loading?: boolean;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(batches.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = useMemo(
    () => batches.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [batches, safePage],
  );

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--background)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-[var(--background)]" />
                <div className="h-2.5 w-1/2 rounded bg-[var(--background)]" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-14 rounded-md bg-[var(--background)]" />
              <div className="h-6 w-14 rounded-md bg-[var(--background)]" />
              <div className="h-6 w-14 rounded-md bg-[var(--background)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
        <Layers className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
        <h3 className="mb-2 font-semibold">No batch pipelines yet</h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">Add a Batch Video Gen step to your pipeline to create batch runs</p>
        <Link
          href="/templates"
          className="inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Build Pipeline
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {paginatedItems.map((batch) => {
          const isActive = batch.status === 'pending' || batch.status === 'processing';
          const isCompleted = batch.status === 'completed';
          const isFailed = batch.status === 'failed';
          const isPartial = batch.status === 'partial';
          const progress = batch.totalJobs > 0 ? Math.round((batch.completedJobs / batch.totalJobs) * 100) : 0;
          const pending = batch.totalJobs - batch.completedJobs - batch.failedJobs;

          return (
            <Link
              key={batch.id}
              href={`/jobs/batch/${batch.id}`}
              className={`group relative overflow-hidden rounded-xl border transition-all hover:shadow-md ${
                isActive ? 'border-blue-300 dark:border-blue-800' :
                isFailed ? 'border-red-200 dark:border-red-900/40' :
                isPartial ? 'border-orange-200 dark:border-orange-900/40' :
                'border-[var(--border)]'
              } bg-[var(--surface)]`}
            >
              {isActive && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-pulse" />
              )}

              <div className="p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                      isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
                      isFailed ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
                      isPartial ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
                      'bg-[var(--accent)] text-[var(--text-muted)]'
                    }`}>
                      {batch.name?.[0]?.toUpperCase() || 'B'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold group-hover:text-[var(--primary)] transition-colors">{batch.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {batch.totalJobs} pipeline run{batch.totalJobs !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isCompleted ? 'bg-[var(--accent)] text-[var(--text-muted)]' :
                    isFailed ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
                    isPartial ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
                    isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
                    'bg-[var(--accent)] text-[var(--text-muted)]'
                  }`}>
                    {isActive && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                    {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                  </span>
                </div>

                {isActive && (
                  <div className="mb-3">
                    <ProgressBar progress={progress} />
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">{progress}% complete</div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text)]">
                    <Layers className="h-3 w-3 text-[var(--text-muted)]" />
                    {batch.totalJobs}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {batch.completedJobs}
                  </span>
                  {batch.failedJobs > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/30 px-2 py-1 text-[10px] font-medium text-red-500 dark:text-red-400">
                      <XCircle className="h-3 w-3" />
                      {batch.failedJobs}
                    </span>
                  )}
                  {pending > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                      <Clock className="h-3 w-3" />
                      {pending}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    {formatDate(batch.createdAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                View details <Arrow className="ml-0.5 h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </div>

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
  );
}
