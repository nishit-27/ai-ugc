'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, ExternalLink, Clock, Calendar } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type {
  TwitterPipeline,
  TwitterPipelineStep,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterReplyConfig,
  TwitterQuoteConfig,
  TwitterEngageConfig,
  TwitterMediaConfig,
} from '@/types';

const XLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
  completed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  partial: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  failed: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
  draft: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

function statusClass(status: string) {
  return STATUS_STYLES[status] || STATUS_STYLES.draft;
}

const STEP_LABELS: Record<string, string> = {
  tweet: 'Tweet',
  thread: 'Thread',
  reply: 'Reply',
  quote: 'Quote',
  engage: 'Engage',
  media: 'Media',
};

function stepSummary(step: TwitterPipelineStep): string {
  switch (step.type) {
    case 'tweet':
      return (step.config as TwitterTweetConfig).content || '(no content)';
    case 'thread': {
      const items = (step.config as TwitterThreadConfig).items || [];
      return `${items.length} tweets · ${items[0]?.content || ''}`;
    }
    case 'reply':
      return (step.config as TwitterReplyConfig).content || '(no content)';
    case 'quote':
      return (step.config as TwitterQuoteConfig).content || '(no content)';
    case 'engage': {
      const a = (step.config as TwitterEngageConfig).actions || {};
      const on = Object.entries(a).filter(([, v]) => v).map(([k]) => k);
      return on.length ? on.join(', ') : '(no actions)';
    }
    case 'media':
      return (step.config as TwitterMediaConfig).mediaUrl || '(no media)';
    default:
      return '';
  }
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

interface TwitterPipelineJobListProps {
  pipelines: TwitterPipeline[];
}

export default function TwitterPipelineJobList({ pipelines }: TwitterPipelineJobListProps) {
  const [selected, setSelected] = useState<TwitterPipeline | null>(null);

  if (pipelines.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
          <XLogo className="h-5 w-5 text-[var(--text-muted)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)]">No Twitter pipelines yet</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Create one from the Twitter page</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {pipelines.map((pipeline) => {
          const results = pipeline.results || [];
          const okCount = results.filter((r) => r.success).length;
          return (
            <button
              key={pipeline.id}
              onClick={() => setSelected(pipeline)}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-all hover:border-[var(--text-muted)]/40 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                  <XLogo className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{pipeline.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {(pipeline.steps as unknown[])?.length || 0} steps
                    {results.length > 0 && ` · ${okCount}/${results.length} posts ok`}
                    {' · '}
                    {new Date(pipeline.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(pipeline.status)}`}>
                {pipeline.status}
              </span>
            </button>
          );
        })}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name}
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusClass(selected.status)}`}>
                {selected.status}
              </span>
              {selected.publishMode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                  <Clock className="h-3 w-3" />
                  {selected.publishMode}
                </span>
              )}
              {selected.scheduledFor && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                  <Calendar className="h-3 w-3" />
                  {formatDate(selected.scheduledFor)}
                </span>
              )}
            </div>

            {selected.error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                {selected.error}
              </div>
            )}

            {/* Steps */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Steps ({selected.steps?.length || 0})
              </h4>
              <div className="space-y-2">
                {(selected.steps || []).map((step, i) => (
                  <div
                    key={step.id}
                    className={`rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 ${
                      step.enabled ? '' : 'opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1DA1F2]/10 text-[10px] font-bold text-[#1DA1F2]">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        {STEP_LABELS[step.type] || step.type}
                      </span>
                      {!step.enabled && <span className="text-[10px] text-[var(--text-muted)]">(disabled)</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 pl-7 text-[11px] text-[var(--text-secondary)]">
                      {stepSummary(step)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Results */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Results {selected.results?.length ? `(${selected.results.length})` : ''}
              </h4>
              {!selected.results || selected.results.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {selected.status === 'running' ? 'Running… results will appear here.' : 'No results recorded.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selected.results.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2"
                    >
                      {r.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          {STEP_LABELS[r.stepType] || r.stepType}
                          {r.modelName ? ` · ${r.modelName}` : ''}
                        </p>
                        {r.error && <p className="truncate text-[11px] text-red-500">{r.error}</p>}
                      </div>
                      {r.postUrl && (
                        <a
                          href={r.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-1 text-[11px] text-[#1DA1F2] hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
