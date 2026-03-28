'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTemplates } from '@/hooks/useTemplates';
import { usePipelineBatches } from '@/hooks/usePipelineBatches';
import { useModelFilterOptions } from '@/hooks/useModelFilterOptions';
import type { DateFilterValue } from '@/types/media-filters';
import { getDateFilterCutoffMs, getDateFilterSortDirection, toMillis } from '@/lib/media-filters';
import type { MiniAppStep, PipelineBatch, TemplateJob } from '@/types';
import TemplateJobList from '@/components/templates/TemplateJobList';
import PipelineBatchList from '@/components/templates/PipelineBatchList';
import MasterBatchList from '@/components/templates/MasterBatchList';
import ModelDateToolbar from '@/components/media/ModelDateToolbar';
import PageTransition from '@/components/ui/PageTransition';

function getStepModelIds(steps: MiniAppStep[] = []): string[] {
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step?.enabled) continue;
    const config = step.config as { modelId?: string };
    if (typeof config?.modelId === 'string' && config.modelId) {
      ids.add(config.modelId);
    }
  }
  return [...ids];
}

function getTemplateJobModelIds(job: TemplateJob): string[] {
  const ids = new Set<string>();
  if (job.modelId) ids.add(job.modelId);
  for (const id of getStepModelIds(job.pipeline || [])) ids.add(id);
  return [...ids];
}

function getPipelineBatchModelIds(batch: PipelineBatch): string[] {
  const ids = new Set<string>();
  for (const id of getStepModelIds(batch.pipeline || [])) ids.add(id);
  for (const model of batch.masterConfig?.models || []) {
    if (model?.modelId) ids.add(model.modelId);
  }
  return [...ids];
}

function getItemTimeMs(item: { createdAt?: string; completedAt?: string }): number {
  return toMillis(item.createdAt || item.completedAt || null);
}

function JobsPageInner() {
  const searchParams = useSearchParams();
  const { jobs, loading: jobsLoading, refresh: refreshJobs, refreshing: refreshingJobs } = useTemplates();
  const { batches, loading: batchesLoading, refresh: refreshBatches, refreshing: refreshingBatches, renameBatch } = usePipelineBatches();
  const { models: modelOptions } = useModelFilterOptions();
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('newest');

  // Derive master vs regular batches
  const masterBatches = useMemo(() => batches.filter(b => b.isMaster), [batches]);
  const regularBatches = useMemo(() => batches.filter(b => !b.isMaster), [batches]);

  const [tab, setTab] = useState<'single' | 'batch' | 'master' | 'twitter'>(() => {
    const param = searchParams.get('tab');
    if (param === 'batch') return 'batch';
    if (param === 'master') return 'master';
    if (param === 'twitter') return 'twitter';
    return 'single';
  });

  const [newJobSeed] = useState<{ id?: string; name?: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem('ai-ugc-new-job');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Filter out batch child jobs from single view
  const singleJobs = useMemo(() => jobs.filter(j => !j.pipelineBatchId), [jobs]);
  const filteredSingleJobs = useMemo(() => {
    const cutoff = getDateFilterCutoffMs(dateFilter);
    const sortDirection = getDateFilterSortDirection(dateFilter);
    const filtered = singleJobs.filter((job) => {
      if (modelFilter !== 'all' && !getTemplateJobModelIds(job).includes(modelFilter)) return false;
      if (cutoff !== null && getItemTimeMs(job) < cutoff) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortDirection === 'desc'
        ? getItemTimeMs(b) - getItemTimeMs(a)
        : getItemTimeMs(a) - getItemTimeMs(b)
    );
  }, [singleJobs, modelFilter, dateFilter]);

  const filteredRegularBatches = useMemo(() => {
    const cutoff = getDateFilterCutoffMs(dateFilter);
    const sortDirection = getDateFilterSortDirection(dateFilter);
    const filtered = regularBatches.filter((batch) => {
      if (modelFilter !== 'all' && !getPipelineBatchModelIds(batch).includes(modelFilter)) return false;
      if (cutoff !== null && getItemTimeMs(batch) < cutoff) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortDirection === 'desc'
        ? getItemTimeMs(b) - getItemTimeMs(a)
        : getItemTimeMs(a) - getItemTimeMs(b)
    );
  }, [regularBatches, modelFilter, dateFilter]);

  const filteredMasterBatches = useMemo(() => {
    const cutoff = getDateFilterCutoffMs(dateFilter);
    const sortDirection = getDateFilterSortDirection(dateFilter);
    const filtered = masterBatches.filter((batch) => {
      if (modelFilter !== 'all' && !getPipelineBatchModelIds(batch).includes(modelFilter)) return false;
      if (cutoff !== null && getItemTimeMs(batch) < cutoff) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortDirection === 'desc'
        ? getItemTimeMs(b) - getItemTimeMs(a)
        : getItemTimeMs(a) - getItemTimeMs(b)
    );
  }, [masterBatches, modelFilter, dateFilter]);

  const newJobName = useMemo(() => {
    if (!newJobSeed) return null;
    const found = newJobSeed.id ? jobs.find((job) => job.id === newJobSeed.id) : null;
    if (found && found.status !== 'queued') return null;
    return newJobSeed.name || 'Pipeline';
  }, [jobs, newJobSeed]);

  const refreshing = refreshingJobs || refreshingBatches;
  const handleRefresh = async () => {
    await Promise.all([refreshJobs(), refreshBatches()]);
  };
  // Twitter pipelines
  const [twitterPipelines, setTwitterPipelines] = useState<{ id: string; name: string; status: string; steps: unknown[]; createdAt: string; completedAt?: string }[]>([]);
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [twitterFetched, setTwitterFetched] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    if (tab === 'twitter' && !twitterFetched && !twitterLoading) {
      setTwitterLoading(true);
      setTwitterFetched(true);
      fetch('/api/twitter/pipelines')
        .then((r) => r.json())
        .then((data) => setTwitterPipelines(data.pipelines || []))
        .catch(() => {})
        .finally(() => setTwitterLoading(false));
    }
  }, [tab, twitterFetched, twitterLoading]);

  const itemCount = tab === 'single'
    ? filteredSingleJobs.length
    : tab === 'batch'
      ? filteredRegularBatches.length
      : tab === 'twitter'
        ? twitterPipelines.length
        : filteredMasterBatches.length;
  const isTabLoading = (tab === 'single' && jobsLoading) || ((tab === 'batch' || tab === 'master') && batchesLoading) || (tab === 'twitter' && twitterLoading);

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Jobs</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {isTabLoading
              ? 'Loading...'
              : `${itemCount} ${tab === 'single' ? 'job' : tab === 'batch' ? 'batch' : 'master batch'}${itemCount !== 1 ? (tab === 'single' ? 's' : 'es') : ''}`
            }
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          {/* Tab toggle */}
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <button
              onClick={() => setTab('single')}
              className={`px-3 py-1.5 text-xs font-medium transition-all rounded-l-lg ${
                tab === 'single'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setTab('batch')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                tab === 'batch'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              Batch
              {filteredRegularBatches.some(b => b.status === 'processing' || b.status === 'pending') && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setTab('master')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                tab === 'master'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              Master
              {filteredMasterBatches.some(b => b.status === 'processing' || b.status === 'pending') && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setTab('twitter')}
              className={`px-3 py-1.5 text-xs font-medium transition-all rounded-r-lg ${
                tab === 'twitter'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              Twitter
              {twitterPipelines.some(p => p.status === 'running') && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          </div>
          <ModelDateToolbar
            modelId={modelFilter}
            onModelChange={setModelFilter}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            modelOptions={modelOptions}
            onRefresh={handleRefresh}
            className={refreshing ? 'pointer-events-none opacity-90' : ''}
          />
        </div>
      </div>

      {/* Full-page loader while fetching from DB */}
      {isTabLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          <p className="text-sm font-medium text-[var(--text-muted)]">Loading jobs...</p>
        </div>
      ) : (
        <>
          {tab === 'single' && newJobName && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Pipeline started</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70">{newJobName} is being processed. This may take a moment.</p>
              </div>
            </div>
          )}

          {tab === 'single' ? (
            <TemplateJobList jobs={filteredSingleJobs} />
          ) : tab === 'batch' ? (
            <PipelineBatchList batches={filteredRegularBatches} />
          ) : tab === 'twitter' ? (
            <div className="space-y-2">
              {twitterPipelines.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                    <svg className="h-5 w-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">No Twitter pipelines yet</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Create one from the Twitter page</p>
                </div>
              ) : (
                twitterPipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                        <svg className="h-4 w-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{pipeline.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {(pipeline.steps as unknown[])?.length || 0} steps &middot; {new Date(pipeline.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      pipeline.status === 'running' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                        : pipeline.status === 'completed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : pipeline.status === 'failed' ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {pipeline.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <MasterBatchList batches={filteredMasterBatches} onRename={renameBatch} />
          )}
        </>
      )}
    </PageTransition>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Jobs</h1>
            <p className="text-xs text-[var(--text-muted)]">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <JobsPageInner />
    </Suspense>
  );
}
