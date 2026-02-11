'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useTemplates } from '@/hooks/useTemplates';
import { usePipelineBatches } from '@/hooks/usePipelineBatches';
import TemplateJobList from '@/components/templates/TemplateJobList';
import PipelineBatchList from '@/components/templates/PipelineBatchList';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function JobsPageInner() {
  const searchParams = useSearchParams();
  const { jobs, loading: jobsLoading, refresh: refreshJobs, refreshing: refreshingJobs } = useTemplates();
  const { batches, loading: batchesLoading, refresh: refreshBatches, refreshing: refreshingBatches } = usePipelineBatches();

  const [tab, setTab] = useState<'single' | 'batch'>(() => {
    const param = searchParams.get('tab');
    return param === 'batch' ? 'batch' : 'single';
  });

  const [newJobName, setNewJobName] = useState<string | null>(null);

  // Filter out batch child jobs from single view
  const singleJobs = useMemo(() => jobs.filter(j => !j.pipelineBatchId), [jobs]);

  // Show a banner if we just came from creating a job
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ai-ugc-new-job');
      if (raw) {
        const job = JSON.parse(raw);
        setNewJobName(job.name || 'Pipeline');
      }
    } catch {}
  }, []);

  // Hide banner once the job appears in real polled data
  useEffect(() => {
    if (!newJobName) return;
    try {
      const raw = sessionStorage.getItem('ai-ugc-new-job');
      if (!raw) { setNewJobName(null); return; }
      const nj = JSON.parse(raw);
      const found = jobs.find((j) => j.id === nj.id);
      if (found && found.status !== 'queued') {
        setNewJobName(null);
      }
    } catch {}
  }, [jobs, newJobName]);

  const refreshing = tab === 'single' ? refreshingJobs : refreshingBatches;
  const handleRefresh = tab === 'single' ? refreshJobs : refreshBatches;
  const itemCount = tab === 'single' ? singleJobs.length : batches.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Jobs</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {(tab === 'single' && jobsLoading) || (tab === 'batch' && batchesLoading)
              ? 'Loading...'
              : `${itemCount} ${tab === 'single' ? 'job' : 'batch'}${itemCount !== 1 ? (tab === 'single' ? 's' : 'es') : ''}`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)]">
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
              className={`px-3 py-1.5 text-xs font-medium transition-all rounded-r-lg ${
                tab === 'batch'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              Batch
              {batches.some(b => b.status === 'processing' || b.status === 'pending') && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Full-page loader while fetching from DB */}
      {((tab === 'single' && jobsLoading) || (tab === 'batch' && batchesLoading)) ? (
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
            <TemplateJobList jobs={singleJobs} />
          ) : (
            <PipelineBatchList batches={batches} />
          )}
        </>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
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
