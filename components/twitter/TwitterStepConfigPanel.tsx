'use client';

import { useRef, useEffect } from 'react';
import { X, MessageSquare, ListOrdered, Reply, Quote, Heart, ImageIcon } from 'lucide-react';
import gsap from 'gsap';
import type { TwitterPipelineStep, TwitterTweetConfig, TwitterThreadConfig, TwitterReplyConfig, TwitterQuoteConfig, TwitterEngageConfig, TwitterMediaConfig } from '@/types';
import TweetStepConfig from './TweetStepConfig';
import ThreadStepConfig from './ThreadStepConfig';
import ReplyStepConfig from './ReplyStepConfig';
import QuoteStepConfig from './QuoteStepConfig';
import EngageStepConfig from './EngageStepConfig';
import MediaStepConfig from './MediaStepConfig';

const STEP_META: Record<string, { label: string; icon: typeof MessageSquare }> = {
  tweet: { label: 'Tweet', icon: MessageSquare },
  thread: { label: 'Thread', icon: ListOrdered },
  reply: { label: 'Reply', icon: Reply },
  quote: { label: 'Quote', icon: Quote },
  engage: { label: 'Engage', icon: Heart },
  media: { label: 'Media', icon: ImageIcon },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenerateFn = (params: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FetchTweetFn = (url: string) => Promise<any>;

interface TwitterStepConfigPanelProps {
  step: TwitterPipelineStep | null;
  onClose: () => void;
  onUpdate: (stepId: string, config: Partial<TwitterPipelineStep['config']>) => void;
  onGenerate: GenerateFn;
  onFetchTweet: FetchTweetFn;
  isGenerating?: boolean;
}

export default function TwitterStepConfigPanel({
  step,
  onClose,
  onUpdate,
  onGenerate,
  onFetchTweet,
  isGenerating,
}: TwitterStepConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    if (step) {
      gsap.fromTo(
        panelRef.current,
        { x: 30, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, duration: 0.35, ease: 'power3.out' }
      );
    }
  }, [step?.id]);

  if (!step) return null;

  const meta = STEP_META[step.type];
  const Icon = meta.icon;

  const handleChange = (config: Partial<TwitterPipelineStep['config']>) => {
    onUpdate(step.id, config);
  };

  return (
    <div
      ref={panelRef}
      className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
          <Icon className="h-4 w-4 text-[var(--text-muted)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{meta.label}</h3>
          <p className="text-[11px] text-[var(--text-muted)]">Configure this step</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {step.type === 'tweet' && (
          <TweetStepConfig
            config={step.config as TwitterTweetConfig}
            onChange={handleChange}
            onGenerate={onGenerate}
            onFetchTweet={onFetchTweet}
            isGenerating={isGenerating}
          />
        )}
        {step.type === 'thread' && (
          <ThreadStepConfig
            config={step.config as TwitterThreadConfig}
            onChange={handleChange}
            onGenerate={onGenerate}
            isGenerating={isGenerating}
          />
        )}
        {step.type === 'reply' && (
          <ReplyStepConfig
            config={step.config as TwitterReplyConfig}
            onChange={handleChange}
            onGenerate={onGenerate}
            onFetchTweet={onFetchTweet}
            isGenerating={isGenerating}
          />
        )}
        {step.type === 'quote' && (
          <QuoteStepConfig
            config={step.config as TwitterQuoteConfig}
            onChange={handleChange}
            onGenerate={onGenerate}
            onFetchTweet={onFetchTweet}
            isGenerating={isGenerating}
          />
        )}
        {step.type === 'engage' && (
          <EngageStepConfig
            config={step.config as TwitterEngageConfig}
            onChange={handleChange}
            onFetchTweet={onFetchTweet}
          />
        )}
        {step.type === 'media' && (
          <MediaStepConfig
            config={step.config as TwitterMediaConfig}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  );
}
