'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { PostingActivityEntry } from '@/types';
import { cachedFetch } from '@/lib/analytics-cache';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const FILTERS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '3m', days: 90 },
  { label: 'All', days: 0 },
] as const;

const BAR_COLOR = '#f59e0b';
const BAR_TODAY = '#8b5cf6';

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }
  if (totalDays <= 90) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function PostingActivity({ refreshKey }: { refreshKey?: string }) {
  const [filter, setFilter] = useState(30);
  const [unique, setUnique] = useState(false);
  const [rawData, setRawData] = useState<PostingActivityEntry[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    setTodayStr(toLocalDateStr(new Date()));
  }, []);

  const fetchData = useCallback(async (days: number, uniqueMode: boolean) => {
    try {
      const params = new URLSearchParams();
      if (days > 0) params.set('days', String(days));
      if (uniqueMode) params.set('unique', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await cachedFetch<{ postingActivity?: PostingActivityEntry[]; totalVideos?: number }>(`/api/analytics/posting-activity${qs}`);
      setRawData(json.postingActivity || []);
      setTotalVideos(json.totalVideos || 0);
    } catch (e) {
      console.error('Failed to load posting activity:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(filter, unique);
  }, [filter, unique, fetchData, refreshKey]);

  // Fill in missing dates so the chart has no gaps
  const chartData = useMemo(() => {
    if (rawData.length === 0) return [];

    const dataMap = new Map(rawData.map(d => [d.date, d]));

    // Determine date range
    const allDates = rawData.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');

    // If today is after the last data point, extend to today
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; posts: number; totalViews: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const entry = dataMap.get(key);
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        posts: entry?.posts || 0,
        totalViews: entry?.totalViews || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return filled;
  }, [rawData]);

  // Best day (highest uploads)
  const bestDay = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((b, d) => (d.posts > b.posts ? d : b), chartData[0]);
  }, [chartData]);

  // Determine tick interval based on data length
  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 7) return 0; // show every tick
    if (len <= 31) return Math.ceil(len / 10) - 1;
    if (len <= 90) return Math.ceil(len / 12) - 1;
    return Math.ceil(len / 10) - 1;
  }, [chartData]);

  if (!loading && (totalVideos === 0 || chartData.length === 0)) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2">
        <p className="text-sm text-[var(--text-muted)]">No posting data yet.</p>
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
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between pb-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Posting Activity
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {loading ? '...' : totalVideos}{' '}
            <span className="text-sm font-medium text-[var(--text-muted)]">{unique ? 'unique videos' : 'total posts'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUnique(u => !u)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              unique
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full transition-colors ${unique ? 'bg-white' : 'bg-[var(--text-muted)] opacity-40'}`} />
            Unique
          </button>
          {bestDay && bestDay.posts > 0 && (
            <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
              Peak: <span className="font-semibold text-[var(--foreground)]">{bestDay.posts}</span> on{' '}
              <span className="font-semibold text-[var(--foreground)]">
                {new Date(bestDay.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          )}
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

      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
              axisLine={false}
              tickLine={false}
              width={24}
              allowDecimals={false}
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
              formatter={(v: number, name: string) => [
                name === 'posts' ? `${v} video${v !== 1 ? 's' : ''}` : formatNumber(v) + ' views',
                name === 'posts' ? 'Uploaded' : 'Total Views',
              ]}
            />
            {todayStr && (
              <ReferenceLine
                x={chartData.find(d => d.date === todayStr)?.label}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            <Bar dataKey="posts" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={entry.date === todayStr ? BAR_TODAY : BAR_COLOR}
                  fillOpacity={entry.date === todayStr ? 1 : 0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
