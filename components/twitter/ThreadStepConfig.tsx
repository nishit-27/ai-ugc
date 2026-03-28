'use client';

import { useRef, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Sparkles, ImageIcon } from 'lucide-react';
import gsap from 'gsap';
import type { TwitterThreadConfig, TwitterThreadItem } from '@/types';

interface ThreadStepConfigProps {
  config: TwitterThreadConfig;
  onChange: (config: Partial<TwitterThreadConfig>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onGenerate: (params: any) => Promise<any>;
  isGenerating?: boolean;
}

export default function ThreadStepConfig({ config, onChange, onGenerate, isGenerating }: ThreadStepConfigProps) {
  const itemsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemsRef.current) return;
    const lastChild = itemsRef.current.lastElementChild;
    if (lastChild) {
      gsap.fromTo(lastChild, { y: 15, autoAlpha: 0, scale: 0.97 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' });
    }
  }, [config.items.length]);

  const addItem = () => {
    const newItem: TwitterThreadItem = { id: crypto.randomUUID(), content: '' };
    onChange({ items: [...config.items, newItem] });
  };

  const removeItem = (id: string) => {
    if (config.items.length <= 2) return;
    onChange({ items: config.items.filter((item) => item.id !== id) });
  };

  const updateItem = (id: string, content: string) => {
    onChange({
      items: config.items.map((item) => (item.id === id ? { ...item, content } : item)),
    });
  };

  const handleGenerateThread = async () => {
    const result = await onGenerate({
      mode: 'generate',
      genre: config.genre,
      topic: config.topic,
      type: 'thread',
      threadItemCount: config.items.length || 5,
    });
    if (result?.threadItems?.length) {
      const newItems: TwitterThreadItem[] = result.threadItems.map((content: string) => ({
        id: crypto.randomUUID(),
        content,
      }));
      onChange({ items: newItems });
    }
  };

  return (
    <div className="space-y-4">
      {/* Generate controls */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Genre</label>
            <input
              type="text"
              value={config.genre || ''}
              onChange={(e) => onChange({ genre: e.target.value })}
              placeholder="e.g. Educational"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Topic</label>
            <input
              type="text"
              value={config.topic || ''}
              onChange={(e) => onChange({ topic: e.target.value })}
              placeholder="e.g. AI tools"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={handleGenerateThread}
          disabled={isGenerating}
          className="mt-3 w-full rounded-lg bg-[#1DA1F2] px-4 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-[#1a91da] hover:shadow-lg disabled:opacity-60"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating thread...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Generate Thread ({config.items.length} tweets)
            </span>
          )}
        </button>
      </div>

      {/* Thread items */}
      <div ref={itemsRef} className="space-y-3">
        {config.items.map((item, index) => (
          <div
            key={item.id}
            className="group relative rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 transition-all hover:border-[var(--primary)]/30"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 cursor-grab text-[var(--text-muted)]" />
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1DA1F2]/10 text-xs font-bold text-[#1DA1F2]">
                  {index + 1}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {item.content.length}/280
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {/* TODO: media picker */}}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
                {config.items.length > 2 && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded-md p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={item.content}
              onChange={(e) => updateItem(item.id, e.target.value)}
              placeholder={index === 0 ? 'Start your thread...' : 'Continue the thread...'}
              rows={3}
              className="w-full resize-none rounded-lg border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
            />
            {/* Char progress */}
            <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min((item.content.length / 280) * 100, 100)}%`,
                  backgroundColor: item.content.length > 280 ? '#EF4444' : '#1DA1F2',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add tweet */}
      <button
        onClick={addItem}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-3 text-sm text-[var(--text-muted)] transition-all hover:border-[#1DA1F2] hover:text-[#1DA1F2]"
      >
        <Plus className="h-4 w-4" />
        Add tweet to thread
      </button>
    </div>
  );
}
