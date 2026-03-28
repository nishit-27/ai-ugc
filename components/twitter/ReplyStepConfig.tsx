'use client';

import { useState, useCallback } from 'react';
import { Link, Sparkles, Wand2, ImageIcon, X } from 'lucide-react';
import type { TwitterReplyConfig } from '@/types';

interface ReplyStepConfigProps {
  config: TwitterReplyConfig;
  onChange: (config: Partial<TwitterReplyConfig>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onGenerate: (params: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFetchTweet: (url: string) => Promise<any>;
  isGenerating?: boolean;
}

export default function ReplyStepConfig({ config, onChange, onGenerate, onFetchTweet, isGenerating }: ReplyStepConfigProps) {
  const [isFetchingTweet, setIsFetchingTweet] = useState(false);
  const charCount = config.content?.length || 0;

  const handleFetchTweet = useCallback(async () => {
    if (!config.tweetUrl) return;
    setIsFetchingTweet(true);
    const tweet = await onFetchTweet(config.tweetUrl);
    if (tweet && typeof tweet === 'object' && 'tweet_id' in (tweet as Record<string, unknown>)) {
      const t = tweet as TwitterReplyConfig['targetTweet'] & { tweet_id: string };
      onChange({ targetTweet: t, tweetId: t.tweet_id });
    }
    setIsFetchingTweet(false);
  }, [config.tweetUrl, onFetchTweet, onChange]);

  const handleGenerate = async () => {
    const result = await onGenerate({
      mode: 'generate',
      genre: config.genre,
      topic: config.topic,
      contextTweet: config.targetTweet,
      type: 'reply',
    });
    if (result?.content) onChange({ content: result.content, mode: 'generate' });
  };

  const handleEnhance = async () => {
    const result = await onGenerate({ mode: 'enhance', currentContent: config.content, type: 'reply' });
    if (result?.content) onChange({ content: result.content });
  };

  return (
    <div className="space-y-4">
      {/* Tweet URL */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Tweet to reply to</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={config.tweetUrl || ''}
              onChange={(e) => onChange({ tweetUrl: e.target.value })}
              placeholder="Paste tweet URL..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DA1F2] focus:outline-none"
            />
          </div>
          <button
            onClick={handleFetchTweet}
            disabled={!config.tweetUrl || isFetchingTweet}
            className="rounded-lg bg-[var(--bg-tertiary)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border)] disabled:opacity-50"
          >
            {isFetchingTweet ? '...' : 'Fetch'}
          </button>
        </div>
      </div>

      {/* Target tweet preview */}
      {config.targetTweet && (
        <div className="rounded-xl border border-[#17BF63]/20 bg-[#17BF63]/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <img src={config.targetTweet.profile_pic_url} alt="" className="h-8 w-8 rounded-full" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{config.targetTweet.name}</p>
              <p className="text-xs text-[var(--text-muted)]">@{config.targetTweet.username}</p>
            </div>
            <button
              onClick={() => onChange({ targetTweet: undefined, tweetId: undefined })}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{config.targetTweet.text}</p>
          <div className="mt-2 flex gap-4 text-xs text-[var(--text-muted)]">
            <span>{config.targetTweet.favorite_count?.toLocaleString()} likes</span>
            <span>{config.targetTweet.retweet_count?.toLocaleString()} retweets</span>
          </div>
        </div>
      )}

      {/* Reply content */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-muted)]">Your Reply</label>
          <span className={`text-xs font-mono ${charCount > 280 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
            {charCount}/280
          </span>
        </div>
        <textarea
          value={config.content || ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Write your reply..."
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#17BF63] focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !config.targetTweet}
          className="flex items-center gap-2 rounded-lg bg-[#1DA1F2] px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-[#1a91da] hover:shadow-lg disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isGenerating ? 'Generating...' : 'Generate Reply'}
        </button>
        {config.content && (
          <button
            onClick={handleEnhance}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Enhance
          </button>
        )}
        <button
          onClick={() => {/* TODO: media picker */}}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
