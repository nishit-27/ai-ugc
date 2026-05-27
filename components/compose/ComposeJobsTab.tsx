'use client';

import { ChevronRight, Film } from 'lucide-react';
import type { LayerSource } from '@/types';
import type {
  ExpandedJob,
  JobBatchItem,
} from '@/hooks/useComposeAssets';

type StandaloneJob = { id: string; name?: string; outputUrl?: string };

export default function ComposeJobsTab({
  isLoadingJobs,
  isLoadingBatchJobs,
  standaloneJobs,
  jobBatches,
  expandedBatchId,
  expandedBatchJobs,
  onAddLayer,
  onExpandBatch,
}: {
  isLoadingJobs: boolean;
  isLoadingBatchJobs: boolean;
  standaloneJobs: StandaloneJob[];
  jobBatches: JobBatchItem[];
  expandedBatchId: string | null;
  expandedBatchJobs: ExpandedJob[];
  onAddLayer: (source: LayerSource, type: 'video' | 'image') => void;
  onExpandBatch: (batchId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {isLoadingJobs ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
        </div>
      ) : (
        <>
          {standaloneJobs.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Standalone Jobs</div>
              <div className="space-y-1">
                {standaloneJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => onAddLayer(
                      { type: 'gallery-video', url: job.outputUrl || '', label: job.name || 'Job output' },
                      'video',
                    )}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
                  >
                    <video
                      src={job.outputUrl}
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                      muted
                      preload="metadata"
                      onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-[var(--text)]">{job.name || 'Job'}</div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Single
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {jobBatches.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Batches</div>
              <div className="space-y-1.5">
                {jobBatches.map((batch) => {
                  const typeBadge = batch.isMaster ? 'Master' : (batch.totalJobs ?? 0) > 1 ? 'Batch' : 'Single';
                  const statusColor = batch.status === 'completed' ? 'bg-emerald-500'
                    : batch.status === 'failed' ? 'bg-red-500'
                    : 'bg-amber-500';
                  const isExpanded = expandedBatchId === batch.id;

                  return (
                    <div key={batch.id}>
                      <button
                        onClick={() => onExpandBatch(batch.id)}
                        className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
                      >
                        <ChevronRight className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-[var(--text)]">{batch.name || 'Batch'}</span>
                            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${
                              typeBadge === 'Master' ? 'bg-purple-500/20 text-purple-400'
                              : typeBadge === 'Batch' ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-gray-500/20 text-gray-400'
                            }`}>{typeBadge}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor}`} />
                            {batch.status || 'pending'}
                            {(batch.totalJobs ?? 0) > 0 && (
                              <span className="ml-1">{batch.completedJobs ?? 0}/{batch.totalJobs} completed</span>
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="ml-3 mt-1 space-y-1 border-l border-[var(--border)] pl-2">
                          {isLoadingBatchJobs ? (
                            <div className="flex items-center justify-center py-3">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                            </div>
                          ) : expandedBatchJobs.length === 0 ? (
                            <p className="py-2 text-[10px] text-[var(--text-muted)]">No jobs in this batch.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-1">
                              {expandedBatchJobs.filter((j) => j.status === 'completed' && (j.signedUrl || j.outputUrl)).map((job) => {
                                const videoUrl = job.signedUrl || job.outputUrl || '';
                                return (
                                  <button
                                    key={job.id}
                                    onClick={() => onAddLayer(
                                      { type: 'gallery-video', url: videoUrl, label: job.name || 'Job output' },
                                      'video',
                                    )}
                                    className="group relative overflow-hidden rounded-md border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                                  >
                                    <video
                                      src={videoUrl}
                                      className="aspect-video w-full object-cover"
                                      muted
                                      preload="metadata"
                                      onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                                      <span className="block truncate text-[8px] text-white leading-tight">{job.name || 'Output'}</span>
                                    </div>
                                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                                      <Film className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {standaloneJobs.length === 0 && jobBatches.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">No completed jobs found.</p>
          )}
        </>
      )}
    </div>
  );
}
