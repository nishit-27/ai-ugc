'use client';

import { useRef, useEffect } from 'react';
import { Check, User } from 'lucide-react';
import gsap from 'gsap';
import type { Account } from '@/types';

interface TwitterAccountSelectorProps {
  accounts: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
}

export default function TwitterAccountSelector({
  accounts,
  selectedIds,
  onChange,
  isLoading,
}: TwitterAccountSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || isLoading) return;
    gsap.fromTo(
      containerRef.current.children,
      { x: -10, autoAlpha: 0 },
      { x: 0, autoAlpha: 1, duration: 0.3, stagger: 0.06, ease: 'power2.out' }
    );
  }, [accounts, isLoading]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-[var(--text-muted)]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
        Loading accounts...
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
        No X/Twitter accounts connected. Connect one in{' '}
        <a href="/connections" className="text-[var(--primary)] underline">
          Connections
        </a>
        .
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const isSelected = selectedIds.includes(account._id);
        return (
          <button
            key={account._id}
            onClick={() => toggle(account._id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
              isSelected
                ? 'border-[#1DA1F2] bg-[#1DA1F2]/10 text-[#1DA1F2]'
                : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {account.profilePicture ? (
              <img
                src={account.profilePicture}
                alt=""
                className="h-5 w-5 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="h-4 w-4" />
            )}
            <span className="max-w-[120px] truncate">
              @{account.username || account.displayName || 'account'}
            </span>
            {isSelected && <Check className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
