'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Wand2, Link, ImageIcon, X, ChevronDown, ChevronLeft, ChevronRight, History } from 'lucide-react';
import gsap from 'gsap';
import type { TwitterTweetConfig } from '@/types';

const GENRES = ['Professional', 'Casual', 'Humorous', 'Motivational', 'Educational', 'Controversial', 'Storytelling'];
const MAX_CHARS = 280;

interface TweetStepConfigProps {
  config: TwitterTweetConfig;
  onChange: (config: Partial<TwitterTweetConfig>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onGenerate: (params: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFetchTweet: (url: string) => Promise<any>;
  isGenerating?: boolean;
}

export default function TweetStepConfig({ config, onChange, onGenerate, onFetchTweet, isGenerating }: TweetStepConfigProps) {
  const [showGenerate, setShowGenerate] = useState(config.mode === 'generate');
  const [genre, setGenre] = useState(config.genre || '');
  const [topic, setTopic] = useState(config.topic || '');
  const [contextUrl, setContextUrl] = useState(config.contextTweetUrl || '');
  const [isFetchingTweet, setIsFetchingTweet] = useState(false);

  // Version history for enhance
  const [versions, setVersions] = useState<string[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [showVersions, setShowVersions] = useState(false);

  const genPanelRef = useRef<HTMLDivElement>(null);
  const versionListRef = useRef<HTMLDivElement>(null);
  const charCount = config.content?.length || 0;

  useEffect(() => {
    if (!genPanelRef.current) return;
    if (showGenerate) {
      gsap.fromTo(genPanelRef.current, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      gsap.to(genPanelRef.current, { height: 0, autoAlpha: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [showGenerate]);

  // Animate version list
  useEffect(() => {
    if (!versionListRef.current) return;
    if (showVersions) {
      gsap.fromTo(versionListRef.current, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.3, ease: 'power2.out' });
    } else {
      gsap.to(versionListRef.current, { height: 0, autoAlpha: 0, duration: 0.2, ease: 'power2.in' });
    }
  }, [showVersions]);

  const handleFetchContext = useCallback(async () => {
    if (!contextUrl) return;
    setIsFetchingTweet(true);
    const tweet = await onFetchTweet(contextUrl);
    if (tweet) {
      onChange({ contextTweetUrl: contextUrl, contextTweet: tweet as TwitterTweetConfig['contextTweet'] });
    }
    setIsFetchingTweet(false);
  }, [contextUrl, onFetchTweet, onChange]);

  const handleGenerate = async () => {
    const result = await onGenerate({
      mode: 'generate',
      genre,
      topic,
      contextTweet: config.contextTweet,
      type: 'tweet',
    });
    if (result?.content) {
      // Save current content as a version before replacing
      if (config.content) {
        setVersions((prev) => [...prev, config.content!]);
      }
      setVersions((prev) => [...prev, result.content]);
      setCurrentVersionIndex(-1);
      onChange({ content: result.content, mode: 'generate', genre, topic });
    }
  };

  const handleEnhance = async () => {
    // Save current version before enhancing
    if (config.content) {
      setVersions((prev) => {
        const newVersions = [...prev];
        // Avoid duplicate of current content
        if (newVersions[newVersions.length - 1] !== config.content) {
          newVersions.push(config.content!);
        }
        return newVersions;
      });
    }

    const result = await onGenerate({
      mode: 'enhance',
      currentContent: config.content,
      type: 'tweet',
    });
    if (result?.content) {
      setVersions((prev) => [...prev, result.content]);
      setCurrentVersionIndex(-1);
      onChange({ content: result.content });
    }
  };

  const restoreVersion = (index: number) => {
    const version = versions[index];
    if (version) {
      setCurrentVersionIndex(index);
      onChange({ content: version });
    }
  };

  const navigateVersion = (direction: 'prev' | 'next') => {
    if (versions.length === 0) return;
    let newIndex: number;
    if (currentVersionIndex === -1) {
      newIndex = direction === 'prev' ? versions.length - 1 : 0;
    } else {
      newIndex = direction === 'prev'
        ? Math.max(0, currentVersionIndex - 1)
        : Math.min(versions.length - 1, currentVersionIndex + 1);
    }
    restoreVersion(newIndex);
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowGenerate(false); onChange({ mode: 'manual' }); }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            !showGenerate
              ? 'bg-[#1DA1F2] text-white shadow-md'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Write Manual
        </button>
        <button
          onClick={() => setShowGenerate(true)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            showGenerate
              ? 'bg-[#1DA1F2] text-white shadow-md'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
          Generate
        </button>
      </div>

      {/* Generate panel */}
      <div ref={genPanelRef} className="overflow-hidden" style={{ height: showGenerate ? 'auto' : 0, opacity: showGenerate ? 1 : 0 }}>
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          {/* Context tweet URL */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              Tweet URL for context (optional)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={contextUrl}
                  onChange={(e) => setContextUrl(e.target.value)}
                  placeholder="https://x.com/user/status/..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DA1F2] focus:outline-none"
                />
              </div>
              <button
                onClick={handleFetchContext}
                disabled={!contextUrl || isFetchingTweet}
                className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border)] disabled:opacity-50"
              >
                {isFetchingTweet ? '...' : 'Fetch'}
              </button>
            </div>
          </div>

          {/* Context tweet preview */}
          {config.contextTweet && (
            <div className="rounded-lg border border-[#1DA1F2]/20 bg-[#1DA1F2]/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <img src={config.contextTweet.profile_pic_url} alt="" className="h-5 w-5 rounded-full" />
                <span className="text-xs font-medium text-[var(--text-primary)]">@{config.contextTweet.username}</span>
                <button
                  onClick={() => onChange({ contextTweet: undefined, contextTweetUrl: '' })}
                  className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-3">{config.contextTweet.text}</p>
            </div>
          )}

          {/* Genre & Topic */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Genre</label>
              <div className="relative">
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-[#1DA1F2] focus:outline-none"
                >
                  <option value="">Select genre</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. AI, Startups..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DA1F2] focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full rounded-lg bg-[#1DA1F2] px-4 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-[#1a91da] hover:shadow-lg disabled:opacity-60"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Generate Tweet
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tweet content */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-muted)]">Tweet Content</label>
          <span className={`text-xs font-mono ${charCount > MAX_CHARS ? 'text-red-500' : charCount > MAX_CHARS * 0.9 ? 'text-yellow-500' : 'text-[var(--text-muted)]'}`}>
            {charCount}/{MAX_CHARS}
          </span>
        </div>
        <textarea
          value={config.content || ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="What's happening?"
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DA1F2] focus:outline-none focus:ring-1 focus:ring-[#1DA1F2]/30"
        />
        {/* Character progress bar */}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min((charCount / MAX_CHARS) * 100, 100)}%`,
              backgroundColor: charCount > MAX_CHARS ? '#EF4444' : charCount > MAX_CHARS * 0.9 ? '#EAB308' : '#1DA1F2',
            }}
          />
        </div>
      </div>

      {/* Enhance + Version history */}
      {config.content && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnhance}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-all hover:border-[#1DA1F2] hover:text-[#1DA1F2] disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Enhance with AI
            </button>

            {versions.length > 0 && (
              <>
                {/* Version navigation arrows */}
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <button
                    onClick={() => navigateVersion('prev')}
                    className="rounded-l-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    title="Previous version"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 text-xs text-[var(--text-muted)]">
                    {currentVersionIndex === -1 ? versions.length : currentVersionIndex + 1}/{versions.length}
                  </span>
                  <button
                    onClick={() => navigateVersion('next')}
                    className="rounded-r-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    title="Next version"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Toggle full version list */}
                <button
                  onClick={() => setShowVersions(!showVersions)}
                  className={`rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] ${showVersions ? 'bg-[var(--bg-tertiary)] text-[#1DA1F2]' : ''}`}
                  title="Show all versions"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Version list */}
          <div ref={versionListRef} className="overflow-hidden" style={{ height: showVersions ? 'auto' : 0, opacity: showVersions ? 1 : 0 }}>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Version History ({versions.length})</p>
              {versions.map((version, i) => (
                <button
                  key={i}
                  onClick={() => restoreVersion(i)}
                  className={`w-full rounded-lg p-2.5 text-left text-xs transition-all ${
                    currentVersionIndex === i
                      ? 'border border-[#1DA1F2]/30 bg-[#1DA1F2]/5 text-[var(--text-primary)]'
                      : 'border border-transparent bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--border)]'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-[var(--text-muted)]">
                      v{i + 1}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {version.length} chars
                    </span>
                  </div>
                  <p className="line-clamp-2">{version}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Media */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Media (optional)</label>
        {config.mediaUrls?.length ? (
          <div className="flex flex-wrap gap-2">
            {config.mediaUrls.map((url, i) => (
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)]">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => onChange({ mediaUrls: config.mediaUrls?.filter((_, j) => j !== i) })}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => {/* TODO: open media picker */}}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-6 text-sm text-[var(--text-muted)] transition-colors hover:border-[#1DA1F2] hover:text-[#1DA1F2]"
          >
            <ImageIcon className="h-4 w-4" />
            Add Media
          </button>
        )}
      </div>

      {/* Reply settings */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Who can reply?</label>
        <div className="relative">
          <select
            value={config.replySettings || ''}
            onChange={(e) => onChange({ replySettings: (e.target.value || undefined) as TwitterTweetConfig['replySettings'] })}
            className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-[#1DA1F2] focus:outline-none"
          >
            <option value="">Everyone</option>
            <option value="following">People you follow</option>
            <option value="mentionedUsers">Only mentioned users</option>
            <option value="subscribers">Subscribers</option>
            <option value="verified">Verified users</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        </div>
      </div>
    </div>
  );
}
