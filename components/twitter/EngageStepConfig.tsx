'use client';

import { useState, useCallback } from 'react';
import { Link, Repeat2, Heart, Bookmark, X } from 'lucide-react';
import type { TwitterEngageConfig } from '@/types';

interface EngageStepConfigProps {
  config: TwitterEngageConfig;
  onChange: (config: Partial<TwitterEngageConfig>) => void;
  onFetchTweet: (url: string) => Promise<unknown>;
}

export default function EngageStepConfig({ config, onChange, onFetchTweet }: EngageStepConfigProps) {
  const [isFetchingTweet, setIsFetchingTweet] = useState(false);

  const handleFetchTweet = useCallback(async () => {
    if (!config.tweetUrl) return;
    setIsFetchingTweet(true);
    const tweet = await onFetchTweet(config.tweetUrl);
    if (tweet && typeof tweet === 'object' && 'tweet_id' in (tweet as Record<string, unknown>)) {
      const t = tweet as TwitterEngageConfig['targetTweet'] & { tweet_id: string };
      onChange({ targetTweet: t, tweetId: t.tweet_id });
    }
    setIsFetchingTweet(false);
  }, [config.tweetUrl, onFetchTweet, onChange]);

  const toggleAction = (action: keyof TwitterEngageConfig['actions']) => {
    onChange({
      actions: { ...config.actions, [action]: !config.actions[action] },
    });
  };

  const ACTIONS = [
    { key: 'retweet' as const, label: 'Retweet', icon: Repeat2, color: '#17BF63', desc: 'Share to your timeline' },
    { key: 'like' as const, label: 'Like', icon: Heart, color: '#E0245E', desc: 'Like this tweet' },
    { key: 'bookmark' as const, label: 'Bookmark', icon: Bookmark, color: '#1DA1F2', desc: 'Save for later' },
  ];

  return (
    <div className="space-y-4">
      {/* Tweet URL */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Tweet to engage with</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={config.tweetUrl || ''}
              onChange={(e) => onChange({ tweetUrl: e.target.value })}
              placeholder="Paste tweet URL..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#E0245E] focus:outline-none"
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
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
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
        </div>
      )}

      {/* Engagement actions */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">Actions</label>
        <div className="space-y-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            const isActive = config.actions[action.key];
            return (
              <button
                key={action.key}
                onClick={() => toggleAction(action.key)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 transition-all ${
                  isActive
                    ? 'border-transparent shadow-md'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]'
                }`}
                style={
                  isActive
                    ? { backgroundColor: `${action.color}15`, borderColor: `${action.color}40` }
                    : undefined
                }
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform"
                  style={{
                    backgroundColor: isActive ? `${action.color}20` : 'var(--bg-tertiary)',
                    color: isActive ? action.color : 'var(--text-muted)',
                  }}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-sm font-medium ${isActive ? '' : 'text-[var(--text-primary)]'}`}
                    style={isActive ? { color: action.color } : undefined}>
                    {action.label}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{action.desc}</p>
                </div>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                    isActive ? 'border-transparent' : 'border-[var(--border)]'
                  }`}
                  style={isActive ? { backgroundColor: action.color } : undefined}
                >
                  {isActive && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
