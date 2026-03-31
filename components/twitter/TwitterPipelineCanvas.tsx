'use client';

import { useRef, useEffect } from 'react';
import { Plus, GripVertical, Eye, EyeOff, Trash2, MessageSquare, ListOrdered, Reply, Quote, Heart, ImageIcon, ChevronRight } from 'lucide-react';
import gsap from 'gsap';
import type { TwitterPipelineStep } from '@/types';

const CARD_W = 340;

const STEP_META: Record<string, { label: string; icon: typeof MessageSquare }> = {
  tweet: { label: 'Tweet', icon: MessageSquare },
  thread: { label: 'Thread', icon: ListOrdered },
  reply: { label: 'Reply', icon: Reply },
  quote: { label: 'Quote', icon: Quote },
  engage: { label: 'Engage', icon: Heart },
  media: { label: 'Media', icon: ImageIcon },
};

function getStepSummary(step: TwitterPipelineStep): string {
  const cfg = step.config as Record<string, unknown>;
  switch (step.type) {
    case 'tweet': {
      const content = (cfg.content as string) || '';
      return content ? content.slice(0, 50) + (content.length > 50 ? '...' : '') : 'Configure tweet...';
    }
    case 'thread': {
      const items = (cfg.items as { content: string }[]) || [];
      return `${items.length} tweets in thread`;
    }
    case 'reply':
    case 'quote': {
      const target = cfg.targetTweet as { username?: string } | undefined;
      return target?.username ? `@${target.username}` : 'No target tweet';
    }
    case 'engage': {
      const actions = cfg.actions as { retweet?: boolean; like?: boolean; bookmark?: boolean } || {};
      const active = Object.entries(actions).filter(([, v]) => v).map(([k]) => k);
      return active.length ? active.join(', ') : 'No actions selected';
    }
    case 'media':
      return cfg.mediaUrl ? 'Media attached' : 'No media yet';
    default:
      return '';
  }
}

function isStepConfigured(step: TwitterPipelineStep): boolean {
  const cfg = step.config as Record<string, unknown>;
  switch (step.type) {
    case 'tweet': return !!(cfg.content as string);
    case 'thread': return ((cfg.items as { content: string }[]) || []).some((i) => i.content);
    case 'reply':
    case 'quote': return !!(cfg.tweetId || cfg.tweetUrl);
    case 'engage': {
      const actions = cfg.actions as Record<string, boolean> || {};
      return Object.values(actions).some(Boolean) && !!(cfg.tweetUrl);
    }
    case 'media': return !!(cfg.mediaUrl || cfg.generatePrompt);
    default: return false;
  }
}

function FlowConnector({ filled }: { filled: boolean }) {
  return (
    <div className="flex justify-center py-0.5">
      <svg width="12" height="32" viewBox="0 0 12 32" fill="none">
        <path
          d="M6 0V24"
          stroke={filled ? '#22c55e' : 'var(--border)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={filled ? '4 3' : 'none'}
          className={filled ? 'animate-dash' : undefined}
        />
        <path
          d="M2.5 22 L6 30 L9.5 22"
          fill={filled ? '#22c55e' : 'var(--border)'}
        />
      </svg>
    </div>
  );
}

interface TwitterPipelineCanvasProps {
  steps: TwitterPipelineStep[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onToggleStep: (id: string) => void;
  onRemoveStep: (id: string) => void;
  onAddStep: () => void;
}

export default function TwitterPipelineCanvas({
  steps,
  selectedStepId,
  onSelectStep,
  onToggleStep,
  onRemoveStep,
  onAddStep,
}: TwitterPipelineCanvasProps) {
  const stepsRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(steps.length);

  useEffect(() => {
    if (!stepsRef.current) return;
    if (steps.length > prevCountRef.current) {
      const lastChild = stepsRef.current.lastElementChild;
      if (lastChild) {
        gsap.fromTo(lastChild, { y: 20, autoAlpha: 0, scale: 0.97 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' });
      }
    }
    prevCountRef.current = steps.length;
  }, [steps.length]);

  useEffect(() => {
    if (!stepsRef.current || steps.length === 0) return;
    gsap.fromTo(
      stepsRef.current.children,
      { y: 15, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.3, stagger: 0.06, ease: 'power2.out' }
    );
  }, []);

  const enabledCount = steps.filter((s) => s.enabled).length;

  return (
    <div
      className="relative flex flex-1 flex-col items-center overflow-y-auto"
      style={{
        backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="flex flex-col items-center py-12 pb-24">
        {/* Source node — X logo */}
        <div
          className="rounded-2xl border border-black/[0.08] bg-[var(--surface)] shadow backdrop-blur-xl dark:border-white/[0.04]"
          style={{ width: CARD_W }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
              <svg className="h-4 w-4 text-[var(--text-primary)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Twitter Pipeline</span>
              <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{steps.length} step{steps.length !== 1 ? 's' : ''} configured</div>
            </div>
          </div>
        </div>

        <FlowConnector filled={steps.length > 0 && steps[0]?.enabled && isStepConfigured(steps[0])} />

        {/* Steps */}
        <div ref={stepsRef} className="flex flex-col items-center">
          {steps.map((step, index) => {
            const meta = STEP_META[step.type];
            const Icon = meta.icon;
            const isSelected = step.id === selectedStepId;
            const summary = getStepSummary(step);
            const configured = isStepConfigured(step);

            return (
              <div key={step.id} className="flex flex-col items-center">
                <div
                  onClick={() => onSelectStep(step.id)}
                  className={`group relative cursor-pointer rounded-2xl border bg-[var(--surface)] backdrop-blur-xl transition-all duration-150 ${
                    isSelected
                      ? 'ring-1 ring-[var(--primary)] border-black/[0.08] shadow-md dark:border-white/[0.04]'
                      : 'border-black/[0.08] shadow hover:shadow-md dark:border-white/[0.04]'
                  } ${!step.enabled ? 'opacity-40' : ''}`}
                  style={{ width: CARD_W }}
                >
                  {/* Animated configured border */}
                  {configured && step.enabled && (
                    <svg className="pointer-events-none absolute inset-[-1px]" style={{ width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', overflow: 'visible' }}>
                      <rect x="0.75" y="0.75" rx="16" ry="16" width="calc(100% - 1.5px)" height="calc(100% - 1.5px)" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6 4" className="animate-dash" />
                    </svg>
                  )}

                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Drag handle */}
                    <div className="cursor-grab text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                      <Icon className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{meta.label}</span>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{summary}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleStep(step.id); }}
                        className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                      >
                        {step.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveStep(step.id); }}
                        className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border)]" />
                  </div>
                </div>

                {/* Connector to next step */}
                {index < steps.length - 1 && (
                  <FlowConnector filled={step.enabled && configured && steps[index + 1]?.enabled && isStepConfigured(steps[index + 1])} />
                )}
              </div>
            );
          })}
        </div>

        {/* Add step button */}
        <FlowConnector filled={false} />

        <button
          onClick={onAddStep}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-3 text-[13px] font-medium text-[var(--text-muted)] shadow-sm backdrop-blur-xl transition-all hover:border-[var(--text-muted)] hover:shadow-md"
          style={{ width: CARD_W }}
        >
          <Plus className="h-4 w-4" />
          Add Step
        </button>

        <FlowConnector filled={enabledCount > 0} />

        {/* Output node */}
        <div
          className="rounded-2xl border border-black/[0.08] bg-[var(--surface)] shadow backdrop-blur-xl dark:border-white/[0.04]"
          style={{ width: CARD_W }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.10)' }}>
              <svg className="h-4 w-4" style={{ color: '#22c55e' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">Output</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {enabledCount} step{enabledCount !== 1 ? 's' : ''} in pipeline
              </div>
            </div>
            {enabledCount > 0 && (
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                Ready
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {/* Empty state is handled by the source → add step → output flow above */}
    </div>
  );
}
