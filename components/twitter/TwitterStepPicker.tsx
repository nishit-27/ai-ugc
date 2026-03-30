'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ListOrdered, Reply, Quote, Heart, ImageIcon, X } from 'lucide-react';
import type { TwitterStepType } from '@/types';

const STEP_OPTIONS: { type: TwitterStepType; label: string; description: string; icon: typeof MessageSquare }[] = [
  { type: 'tweet', label: 'Tweet', description: 'Create a single tweet', icon: MessageSquare },
  { type: 'thread', label: 'Thread', description: 'Multi-tweet thread', icon: ListOrdered },
  { type: 'reply', label: 'Reply', description: 'Reply to a tweet', icon: Reply },
  { type: 'quote', label: 'Quote', description: 'Quote tweet', icon: Quote },
  { type: 'engage', label: 'Engage', description: 'Like, retweet, bookmark', icon: Heart },
  { type: 'media', label: 'Media', description: 'Upload or generate media', icon: ImageIcon },
];

interface TwitterStepPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: TwitterStepType) => void;
}

export default function TwitterStepPicker({ isOpen, onClose, onSelect }: TwitterStepPickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Step</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STEP_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() => {
                  onSelect(option.type);
                  onClose();
                }}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-left transition-all hover:border-[var(--text-muted)] hover:shadow-md"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)] transition-transform group-hover:scale-105">
                  <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">{option.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
