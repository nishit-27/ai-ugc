'use client';

import { Link2, Loader2 } from 'lucide-react';

// Paste an Instagram or TikTok carousel URL to pre-fill the scene grid.
// All state and the actual load handler live in the parent — this is just
// the input + button + error line.
export default function CarouselUrlImport({
  value,
  onChange,
  onLoad,
  isLoading,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onLoad: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLoad()}
            placeholder="Paste Instagram or TikTok carousel URL..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--accent-border)] focus:outline-none"
          />
        </div>
        <button
          onClick={onLoad}
          disabled={isLoading || !value.trim()}
          className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            isLoading || !value.trim()
              ? 'bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed'
              : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'
          }`}
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load'}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </>
  );
}
