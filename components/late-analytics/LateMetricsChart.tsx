'use client';

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { listDateKeysInRange } from '@/lib/dateUtils';
import LateChartTooltip from './LateChartTooltip';

type DailyMetric = {
  date: string;
  postCount: number;
  metrics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    views: number;
  };
};

const METRICS = [
  { key: 'likes', label: 'Likes', icon: '\u2764\uFE0F', color: '#d4698e' },
  { key: 'comments', label: 'Comments', icon: '\uD83D\uDCAC', color: '#3b82f6' },
  { key: 'shares', label: 'Shares', icon: '\u27A1\uFE0F', color: '#22c55e' },
  { key: 'views', label: 'Views', icon: '\uD83D\uDC41\uFE0F', color: '#f59e0b' },
  { key: 'impressions', label: 'Impress.', icon: '\uD83D\uDCC8', color: '#8b5cf6' },
  { key: 'reach', label: 'Reach', icon: '\uD83D\uDC65', color: '#06b6d4' },
  { key: 'clicks', label: 'Clicks', icon: '\uD83D\uDDB1\uFE0F', color: '#64748b' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];
type MetricMap = Record<MetricKey, number>;
type ChartDatum = MetricMap & { date: string };

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function LateMetricsChart({
  dailyMetrics,
  dateRange,
}: {
  dailyMetrics: DailyMetric[];
  dateRange?: { fromDate: string; toDate: string };
}) {
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(['likes', 'comments', 'views', 'impressions']));

  const toggleMetric = (key: string) => {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Compute totals and percentage changes (first half vs second half of period)
  const { totals, deltas } = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of METRICS) t[m.key] = 0;

    for (const day of dailyMetrics) {
      const dm = day.metrics;
      for (const m of METRICS) t[m.key] += dm[m.key] || 0;
    }

    // Compute delta: compare first half vs second half
    const d: Record<string, number | null> = {};
    const mid = Math.floor(dailyMetrics.length / 2);
    if (mid > 0) {
      const firstHalf: Record<string, number> = {};
      const secondHalf: Record<string, number> = {};
      for (const m of METRICS) { firstHalf[m.key] = 0; secondHalf[m.key] = 0; }

      for (let i = 0; i < dailyMetrics.length; i++) {
        const dm = dailyMetrics[i].metrics;
        const target = i < mid ? firstHalf : secondHalf;
        for (const m of METRICS) target[m.key] += dm[m.key] || 0;
      }

      for (const m of METRICS) {
        if (firstHalf[m.key] > 0) {
          d[m.key] = ((secondHalf[m.key] - firstHalf[m.key]) / firstHalf[m.key]) * 100;
        } else {
          d[m.key] = null;
        }
      }
    } else {
      for (const m of METRICS) d[m.key] = null;
    }

    // Engagement rate
    const totalEng = t.likes + t.comments + t.shares;
    t.engRate = t.views > 0 ? (totalEng / t.views) * 100 : 0;

    return { totals: t, deltas: d };
  }, [dailyMetrics]);

  // Build chart data with gap-filling
  const chartData = useMemo(() => {
    if (dailyMetrics.length === 0) return [];

    const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
    const dayMap = new Map<string, MetricMap>();
    for (const day of sorted) {
      const entry = {} as MetricMap;
      for (const m of METRICS) entry[m.key] = day.metrics[m.key] || 0;
      dayMap.set(day.date, entry);
    }

    // Fill gaps
    const fillFrom = dateRange?.fromDate || sorted[0].date;
    const fillTo = dateRange?.toDate || sorted[sorted.length - 1].date;
    const result: ChartDatum[] = [];
    for (const dateStr of listDateKeysInRange(fillFrom, fillTo)) {
      const existing = dayMap.get(dateStr);
      const entry = { date: dateStr } as ChartDatum;
      for (const m of METRICS) entry[m.key] = existing?.[m.key] || 0;
      result.push(entry);
    }
    return result;
  }, [dailyMetrics, dateRange]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Metrics Overview</h3>
        <div className="flex items-center justify-center h-48 text-sm text-[var(--text-muted)]">No metrics data available</div>
      </div>
    );
  }

  const activeArr = METRICS.filter(m => activeMetrics.has(m.key));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      {/* Metric toggles with totals and deltas */}
      <div className="flex flex-wrap items-start gap-4 mb-5">
        {METRICS.map(m => {
          const isActive = activeMetrics.has(m.key);
          const delta = deltas[m.key];
          return (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className="flex flex-col items-start gap-0.5 min-w-[100px]"
            >
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-4 h-4 rounded border-2 flex items-center justify-center text-[10px]"
                  style={{
                    borderColor: isActive ? m.color : 'var(--border)',
                    backgroundColor: isActive ? m.color : 'transparent',
                    color: isActive ? 'white' : 'transparent',
                  }}
                >
                  {isActive ? '✓' : ''}
                </span>
                <span className="font-medium text-[var(--text-primary)]">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-1.5 pl-5">
                <span className="text-lg font-bold text-[var(--text-primary)]">{formatNum(totals[m.key])}</span>
              </div>
              {delta !== null && (
                <span className={`text-xs font-medium pl-5 ${delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% {delta >= 0 ? '\u2191' : '\u2193'}
                </span>
              )}
            </button>
          );
        })}
        {/* Engagement rate (non-toggleable) */}
        <div className="flex flex-col items-start gap-0.5 min-w-[100px]">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[var(--text-muted)]">{"↗️"}</span>
            <span className="font-medium text-[var(--text-primary)]">Eng. Rate</span>
          </div>
          <div className="flex items-baseline gap-1.5 pl-5">
            <span className="text-lg font-bold text-[var(--text-primary)]">{totals.engRate?.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Stacked bar chart */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={v => {
              const d = new Date(v + 'T00:00:00');
              return chartData.length <= 14
                ? d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                : d.toLocaleDateString('en-US', { day: 'numeric' });
            }}
            interval={Math.max(0, Math.floor(chartData.length / 15) - 1)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => formatNum(v)} />
          <Tooltip
            wrapperStyle={{ outline: 'none', zIndex: 20 }}
            cursor={{ fill: 'rgba(113, 113, 122, 0.14)' }}
            content={(
              <LateChartTooltip
                formatLabel={(value) => new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                formatValue={(value) => formatNum(value)}
              />
            )}
          />
          {activeArr.map((m, i) => (
            <Bar
              key={m.key}
              dataKey={m.key}
              stackId="metrics"
              fill={m.color}
              name={m.label}
              radius={i === activeArr.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
