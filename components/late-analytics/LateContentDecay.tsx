'use client';

type DecayBucket = { label: string; percentage: number };

const DEFAULT_BUCKETS: DecayBucket[] = [
  { label: '0-6h', percentage: 0 },
  { label: '6-12h', percentage: 0 },
  { label: '12-24h', percentage: 0 },
  { label: '1-2d', percentage: 0 },
  { label: '2-7d', percentage: 0 },
  { label: '7-30d', percentage: 0 },
  { label: '30d+', percentage: 0 },
];

export default function LateContentDecay({ data }: { data: DecayBucket[] }) {
  const buckets = data.length > 0 ? data : DEFAULT_BUCKETS;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Content Performance Decay</h3>
      <div className="space-y-2">
        {buckets.map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)] w-12 text-right shrink-0">{b.label}</span>
            <div className="flex-1 h-5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${b.percentage}%` }} />
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary)] w-10 text-right">{b.percentage}%</span>
          </div>
        ))}
      </div>
      {buckets.some(b => b.percentage > 0) && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Posts reach {buckets.find(b => b.label === '12-24h')?.percentage || 0}% of total engagement within 24 hours
        </p>
      )}
    </div>
  );
}
