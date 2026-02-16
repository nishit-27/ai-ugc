'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function RefreshButton({ onClick }: { onClick: () => Promise<void> | void }) {
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setSpinning(true);
        try {
          await onClick();
        } finally {
          setTimeout(() => setSpinning(false), 600);
        }
      }}
      disabled={spinning}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--background)] active:scale-95 disabled:opacity-70"
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
      {spinning ? 'Refreshing...' : 'Refresh'}
    </button>
  );
}
