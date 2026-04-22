'use client';

import type { TemplateJob } from '@/types';
import { CheckSquare, Loader2, Square, ThumbsUp } from 'lucide-react';
import MasterJobCard from '@/components/templates/MasterJobCard';

type Props = {
  jobs: TemplateJob[];
  selectableJobs: TemplateJob[];
  selectedJobIds: Set<string>;
  allSelected: boolean;
  posting: boolean;
  busyJobIds: Set<string>;
  modelNameMap: Record<string, string>;
  modelImageMap: Record<string, string>;
  onApproveAll: () => void;
  onToggleSelectAll: () => void;
  onToggleJob: (jobId: string) => void;
  onOpenJob: (job: TemplateJob) => void;
  onApproveJob: (jobId: string) => void;
  onRejectJob: (jobId: string) => void;
  onRepostJob: (jobId: string) => void;
  onQuickRegenerateJob: (jobId: string) => void;
  onEditRegenerateJob: (job: TemplateJob) => void;
  onEditJobOverrides?: (job: TemplateJob) => void;
  jobsWithOverrides?: Set<string>;
  failedUploadJobIds?: Set<string>;
};

export default function MasterBatchVideoGrid({
  jobs,
  selectableJobs,
  selectedJobIds,
  allSelected,
  posting,
  busyJobIds,
  modelNameMap,
  modelImageMap,
  onApproveAll,
  onToggleSelectAll,
  onToggleJob,
  onOpenJob,
  onApproveJob,
  onRejectJob,
  onRepostJob,
  onQuickRegenerateJob,
  onEditRegenerateJob,
  onEditJobOverrides,
  jobsWithOverrides,
  failedUploadJobIds,
}: Props) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">Videos ({jobs.length})</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          {selectableJobs.length > 0 && (
            <button
              onClick={onApproveAll}
              disabled={posting}
              className="flex items-center gap-1.5 rounded-lg bg-master px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
            >
              {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
              Approve All ({selectableJobs.length})
            </button>
          )}
          {selectableJobs.length > 0 && (
            <button
              onClick={onToggleSelectAll}
              className="flex items-center gap-1 text-[10px] sm:text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? 'Clear' : 'Select All'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {jobs.map((job) => (
          <MasterJobCard
            key={job.id}
            job={job}
            modelName={job.modelId ? modelNameMap[job.modelId] : undefined}
            modelImageUrl={job.modelId ? modelImageMap[job.modelId] : undefined}
            isSelected={selectedJobIds.has(job.id)}
            onToggle={() => onToggleJob(job.id)}
            onClick={() => onOpenJob(job)}
            onApprove={() => onApproveJob(job.id)}
            onReject={() => onRejectJob(job.id)}
            onRepost={() => onRepostJob(job.id)}
            onQuickRegenerate={() => onQuickRegenerateJob(job.id)}
            onEditRegenerate={() => onEditRegenerateJob(job)}
            onEditOverrides={onEditJobOverrides ? () => onEditJobOverrides(job) : undefined}
            hasOverrides={jobsWithOverrides?.has(job.id)}
            uploadFailed={failedUploadJobIds?.has(job.id)}
            isApproving={posting || busyJobIds.has(job.id)}
            isRejecting={false}
            isRegenerating={false}
          />
        ))}
      </div>
    </div>
  );
}
