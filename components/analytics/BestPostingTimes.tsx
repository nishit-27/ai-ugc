'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type PostingTime = {
  dayOfWeek: number;
  hour: number;
  posts: number;
  totalViews: number;
  totalEngagement: number;
};

type MetricKey = 'posts' | 'views' | 'engagement';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'engagement', label: 'Engagement' },
  { key: 'views', label: 'Views' },
  { key: 'posts', label: 'Posts' },
];

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function BestPostingTimes({ refreshKey }: { refreshKey: string }) {
  const [data, setData] = useState<PostingTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>('engagement');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/posting-times?days=90', { cache: 'no-store' });
      const json = await res.json();
      setData(json.postingTimes || []);
    } catch (e) {
      console.error('Failed to load posting times:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData, refreshKey]);

  const { grid, maxVal, bestSlots } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const countGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const pt of data) {
      countGrid[pt.dayOfWeek][pt.hour] = pt.posts;
      if (metric === 'posts') {
        grid[pt.dayOfWeek][pt.hour] = pt.posts;
      } else if (metric === 'views') {
        grid[pt.dayOfWeek][pt.hour] = pt.posts > 0 ? Math.round(pt.totalViews / pt.posts) : 0;
      } else {
        grid[pt.dayOfWeek][pt.hour] = pt.posts > 0 ? Math.round(pt.totalEngagement / pt.posts) : 0;
      }
    }

    let maxVal = 0;
    for (const row of grid) for (const v of row) if (v > maxVal) maxVal = v;

    // Find top 3 slots
    const slots: { day: number; hour: number; value: number }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > 0) slots.push({ day: d, hour: h, value: grid[d][h] });
      }
    }
    slots.sort((a, b) => b.value - a.value);

    return { grid, maxVal, bestSlots: slots.slice(0, 3) };
  }, [data, metric]);

  function getCellColor(value: number): string {
    if (maxVal === 0 || value === 0) return 'var(--muted)';
    const intensity = value / maxVal;
    if (intensity > 0.75) return '#22c55e';
    if (intensity > 0.5) return '#4ade80';
    if (intensity > 0.25) return '#86efac';
    return '#bbf7d0';
  }

  function getCellOpacity(value: number): number {
    if (maxVal === 0 || value === 0) return 0.3;
    return 0.4 + (value / maxVal) * 0.6;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--primary)]" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Best Posting Times
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bestSlots.length > 0 && (
            <span className="hidden rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] lg:inline-flex">
              Best: <span className="ml-1 font-semibold text-emerald-500">{DAYS[bestSlots[0].day]} {formatHour(bestSlots[0].hour)}</span>
            </span>
          )}
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            {METRIC_OPTIONS.map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  metric === m.key
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          No posting data yet. Sync accounts to see best times.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="mb-1 flex">
              <div className="w-10 shrink-0" />
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] text-[var(--text-muted)]">
                  {h % 3 === 0 ? formatHour(h) : ''}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            {DAYS.map((day, di) => (
              <div key={day} className="mb-0.5 flex items-center">
                <div className="w-10 shrink-0 text-[10px] font-medium text-[var(--text-muted)]">{day}</div>
                {HOURS.map(h => {
                  const val = grid[di][h];
                  return (
                    <div
                      key={h}
                      className="group relative mx-px flex-1"
                      title={`${day} ${formatHour(h)}: ${metric === 'posts' ? val + ' posts' : formatNumber(val) + (metric === 'views' ? ' avg views' : ' avg engagement')}`}
                    >
                      <div
                        className="h-5 w-full rounded-[3px] transition-all"
                        style={{
                          backgroundColor: getCellColor(val),
                          opacity: getCellOpacity(val),
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">
                {metric === 'posts' ? 'Fewer posts' : metric === 'views' ? 'Lower avg views' : 'Lower avg engagement'}
              </span>
              <div className="flex items-center gap-1">
                {[0.1, 0.3, 0.5, 0.75, 1].map(i => (
                  <div
                    key={i}
                    className="h-3 w-5 rounded-sm"
                    style={{
                      backgroundColor: i <= 0.1 ? 'var(--muted)' : getCellColor(maxVal * i),
                      opacity: i <= 0.1 ? 0.3 : 0.4 + i * 0.6,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {metric === 'posts' ? 'More posts' : metric === 'views' ? 'Higher avg views' : 'Higher avg engagement'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
