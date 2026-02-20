'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const COLORS = {
  likes: '#d4698e',
  comments: '#f59e0b',
  shares: '#22c55e',
};

const FILTERS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '3m', days: 90 },
  { label: 'All', days: 0 },
] as const;

type DailyMetric = { date: string; views: number; likes: number; comments: number; shares: number };

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function EngagementTrend() {
  const [filter, setFilter] = useState(30);
  const [rawData, setRawData] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/daily-metrics${param}`, { cache: 'no-store' });
      const json = await res.json();
      setRawData(json.metrics || []);
    } catch (e) {
      console.error('Failed to load engagement data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(filter);
  }, [filter, fetchData]);

  const chartData = useMemo(() => {
    if (rawData.length === 0) return [];

    const dataMap = new Map(rawData.map(d => [d.date, d]));
    const allDates = rawData.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; likes: number; comments: number; shares: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const entry = dataMap.get(key);
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        likes: entry?.likes || 0,
        comments: entry?.comments || 0,
        shares: entry?.shares || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return filled;
  }, [rawData]);

  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 7) return 0;
    if (len <= 31) return Math.ceil(len / 10) - 1;
    if (len <= 90) return Math.ceil(len / 12) - 1;
    return Math.ceil(len / 10) - 1;
  }, [chartData]);

  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, d) => ({
        likes: acc.likes + d.likes,
        comments: acc.comments + d.comments,
        shares: acc.shares + d.shares,
      }),
      { likes: 0, comments: 0, shares: 0 },
    );
  }, [chartData]);

  return (
    <div>
      <div className="flex items-start justify-between pb-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Engagement Breakdown
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {loading ? '...' : formatNumber(totals.likes + totals.comments + totals.shares)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            {Object.entries(COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-[var(--text-muted)] capitalize">{key}</span>
              </div>
            ))}
          </div>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            {FILTERS.map(f => (
              <button
                key={f.days}
                onClick={() => setFilter(f.days)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  filter === f.days
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading || chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          {loading ? 'Loading...' : 'No engagement data yet.'}
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={formatNumber}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  padding: '6px 10px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                itemStyle={{ color: 'var(--foreground)' }}
                labelFormatter={(_, payload) => {
                  const entry = payload?.[0]?.payload;
                  if (!entry?.date) return '';
                  const d = new Date(entry.date + 'T00:00:00');
                  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                }}
                formatter={(value: number, name: string) => [
                  formatNumber(value),
                  name.charAt(0).toUpperCase() + name.slice(1),
                ]}
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              />
              <Bar dataKey="likes" fill={COLORS.likes} radius={[3, 3, 0, 0]} barSize={12} />
              <Bar dataKey="comments" fill={COLORS.comments} radius={[3, 3, 0, 0]} barSize={12} />
              <Bar dataKey="shares" fill={COLORS.shares} radius={[3, 3, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
