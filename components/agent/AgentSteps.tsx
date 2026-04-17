'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { BarsLoader } from './AgentLoader';

export function AgentSteps({
  title,
  count,
  running,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  running?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
      >
        {running ? (
          <span className="text-[var(--primary)]">
            <BarsLoader size={12} />
          </span>
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
        )}
        <span className="shrink-0 font-medium text-[var(--text-primary)]">{title}</span>
        <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          {count} step{count === 1 ? '' : 's'}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-2">
          <div className="flex flex-col gap-1.5">{children}</div>
        </div>
      )}
    </div>
  );
}
