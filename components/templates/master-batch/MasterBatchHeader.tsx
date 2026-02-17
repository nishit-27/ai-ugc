'use client';

import Link from 'next/link';
import type { MasterConfig, PipelineBatch } from '@/types';
import { ArrowLeft, CheckCircle2, Clock, Crown, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar';
import Spinner from '@/components/ui/Spinner';

type Props = {
  batch: PipelineBatch;
  masterConfig?: MasterConfig;
  isActive: boolean;
  progress: number;
  pending: number;
  isRefreshing: boolean;
  isDeleting: boolean;
  onRefresh: () => void;
  onDelete: () => void;
  onEditConfig?: () => void;
};

export default function MasterBatchHeader({
  batch,
  masterConfig,
  isActive,
  progress,
  pending,
  isRefreshing,
  isDeleting,
  onRefresh,
  onDelete,
  onEditConfig,
}: Props) {
  return (
    <>
      <Link href="/jobs?tab=master" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to master batches
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isActive ? 'bg-master-light text-master dark:text-master-foreground' : 'bg-[var(--accent)] text-[var(--text-muted)]'
            }`}
          >
            <Crown className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-master dark:text-master-foreground">{batch.name}</h1>
            <p className="text-xs text-[var(--text-muted)]">
              {masterConfig?.models?.length || 0} models · {batch.totalJobs} videos
              {masterConfig?.publishMode && ` · ${masterConfig.publishMode}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-300 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/30"
          >
            {isDeleting ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {masterConfig && (
          <div className="mb-3 flex items-start gap-2">
            <div className="flex-1 rounded-lg bg-[var(--background)] p-3 text-sm">
              {masterConfig.caption || <span className="text-[var(--text-muted)] italic">No caption set</span>}
              {masterConfig.publishMode && masterConfig.publishMode !== 'now' && (
                <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                  {masterConfig.publishMode === 'schedule' && `Scheduled: ${masterConfig.scheduledFor || '(not set)'}`}
                  {masterConfig.publishMode === 'queue' && 'Queued'}
                  {masterConfig.publishMode === 'draft' && 'Draft'}
                </div>
              )}
            </div>
            {onEditConfig && (
              <button
                onClick={onEditConfig}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
                title="Edit caption & timing"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs font-medium">
            <Crown className="h-3.5 w-3.5 text-master dark:text-master-foreground" />
            {batch.totalJobs} total
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {batch.completedJobs} done
          </span>
          {batch.failedJobs > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 dark:bg-red-950/30">
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
    </>
  );
}
