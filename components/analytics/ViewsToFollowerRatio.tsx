'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
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

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

type DailyMetric = { date: string; views: number };
type FollowerPoint = { date: string; followers: number };

export default function ViewsToFollowerRatio({ refreshKey }: { refreshKey: string }) {
  const [filter, setFilter] = useState(30);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [followerData, setFollowerData] = useState<FollowerPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const [metricsJson, followerJson] = await Promise.all([
        cachedFetch<{ metrics?: DailyMetric[] }>(`/api/analytics/daily-metrics${param}`),
        cachedFetch<{ history?: FollowerPoint[] }>(`/api/analytics/follower-history${param}`),
      ]);
      setDailyMetrics(metricsJson.metrics || []);
      setFollowerData(followerJson.history || []);
    } catch (e) {
      console.error('Failed to load ratio data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filter);
  }, [filter, fetchData, refreshKey]);

  const chartData = useMemo(() => {
    if (dailyMetrics.length === 0 || followerData.length === 0) return [];

    const viewsMap = new Map(dailyMetrics.map(d => [d.date, d.views]));
    const followerMap = new Map(followerData.map(d => [d.date, d.followers]));

    // Get all dates from both sources
    const allDatesSet = new Set([
      ...dailyMetrics.map(d => d.date),
      ...followerData.map(d => d.date),
    ]);
    const allDates = [...allDatesSet].sort();
    if (allDates.length === 0) return [];

    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; ratio: number; views: number; followers: number }[] = [];
    const cursor = new Date(start);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    let lastFollowers = followerData[0]?.followers || 1;
    // Use a 7-day rolling window for smoothing
    const recentViews: number[] = [];

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const dayViews = viewsMap.get(key) || 0;
      const fol = followerMap.get(key);
      if (fol !== undefined) lastFollowers = fol;

      recentViews.push(dayViews);
      if (recentViews.length > 7) recentViews.shift();

      const avgViews = recentViews.reduce((s, v) => s + v, 0) / recentViews.length;
      const ratio = lastFollowers > 0 ? Number((avgViews / lastFollowers).toFixed(3)) : 0;

      filled.push({
        date: key,
        label: formatDateLabel(key, totalDays),
        ratio,
        views: Math.round(avgViews),
        followers: lastFollowers,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return filled;
  }, [dailyMetrics, followerData]);

  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 7) return 0;
    if (len <= 31) return Math.ceil(len / 10) - 1;
    if (len <= 90) return Math.ceil(len / 12) - 1;
    return Math.ceil(len / 10) - 1;
  }, [chartData]);

  const currentRatio = chartData.length > 0 ? chartData[chartData.length - 1].ratio : 0;
  const startRatio = chartData.length > 0 ? chartData[0].ratio : 0;
  const change = startRatio > 0 ? ((currentRatio - startRatio) / startRatio) * 100 : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#f59e0b]" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Views / Follower Ratio
            </p>
          </div>
          {!loading && chartData.length > 0 && (
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight">{currentRatio.toFixed(2)}x</p>
              {change !== 0 && (
                <span className={`text-xs font-semibold ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
              )}
              <span className="text-[11px] text-[var(--text-muted)]">7-day avg views per follower</span>
            </div>
          )}
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

      {loading || chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          {loading ? 'Loading...' : 'No data yet. Sync accounts to start tracking.'}
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ratioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tickFormatter={(v: number) => v.toFixed(1) + 'x'}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                labelStyle={{ color: 'var(--foreground)' }}
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  if (!d) return '';
                  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                }}
                formatter={(v: number, _: string, entry: { payload?: { views?: number; followers?: number } }) => {
                  const p = entry?.payload;
                  return [
                    `${v.toFixed(3)}x (${formatNumber(p?.views || 0)} views / ${formatNumber(p?.followers || 0)} followers)`,
                    'Ratio',
                  ];
                }}
                cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="ratio"
                fill="url(#ratioFill)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: '#f59e0b', stroke: 'var(--background)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
