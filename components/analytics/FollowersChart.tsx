'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const PRIMARY = '#d4698e';

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

type FollowerPoint = { date: string; followers: number };

export default function FollowersChart({ globalFilter }: { globalFilter?: number }) {
  const [filter, setFilter] = useState(30);
  const [rawData, setRawData] = useState<FollowerPoint[]>([]);
  const [currentFollowers, setCurrentFollowers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (globalFilter !== undefined) setFilter(globalFilter);
  }, [globalFilter]);

  const fetchData = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const [histRes, overviewRes] = await Promise.all([
        fetch(`/api/analytics/follower-history${param}`, { cache: 'no-store' }),
        fetch('/api/analytics/overview', { cache: 'no-store' }),
      ]);
      const histJson = await histRes.json();
      const overviewJson = await overviewRes.json();
      setRawData(histJson.history || []);
      setCurrentFollowers(overviewJson.totalFollowers ?? null);
    } catch (e) {
      console.error('Failed to load follower history:', e);
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

    const dataMap = new Map(rawData.map(d => [d.date, d.followers]));
    const allDates = rawData.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; followers: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    let lastKnown = rawData[0]?.followers || 0;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const val = dataMap.get(key);
      if (val !== undefined) lastKnown = val;
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        followers: lastKnown,
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

  const latest = currentFollowers ?? (chartData.length > 0 ? chartData[chartData.length - 1].followers : 0);

  const { growth, totalChange } = useMemo(() => {
    if (chartData.length < 2) return { growth: 0, totalChange: 0 };
    const first = chartData[0].followers;
    const last = chartData[chartData.length - 1].followers;
    const g = first > 0 ? ((last - first) / first) * 100 : 0;
    return { growth: g, totalChange: last - first };
  }, [chartData]);

  const isPositive = growth >= 0;

  return (
    <div>
      <div className="flex items-start justify-between pb-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Audience Growth
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {loading ? '...' : formatNumber(latest)}
            </p>
            {!loading && totalChange !== 0 && (
              <span className={`text-sm font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{formatNumber(totalChange)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chartData.length > 1 && (
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isPositive
                  ? 'bg-[var(--success-bg)] text-[var(--success)]'
                  : 'bg-[var(--error-bg)] text-[var(--error)]'
              }`}
            >
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isPositive ? '+' : ''}
              {growth.toFixed(1)}%
            </div>
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

      {loading || chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
          {loading ? 'Loading...' : 'No follower data yet. Sync accounts to start tracking.'}
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="followersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
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
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                itemStyle={{ color: 'var(--foreground)' }}
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  if (!d) return '';
                  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  });
                }}
                formatter={(v: number) => [formatNumber(v), 'Total Followers']}
                cursor={{ stroke: PRIMARY, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="followers"
                fill="url(#followersFill)"
                stroke={PRIMARY}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: PRIMARY, stroke: 'var(--background)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
