'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

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

const GAIN = '#22c55e';
const LOSS = '#ef4444';
const TODAY_COLOR = '#8b5cf6';

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

export default function DailyFollowersChart({ globalFilter }: { globalFilter?: number }) {
  const [filter, setFilter] = useState(30);
  const [rawData, setRawData] = useState<FollowerPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    setTodayStr(toLocalDateStr(new Date()));
  }, []);

  useEffect(() => {
    if (globalFilter !== undefined) setFilter(globalFilter);
  }, [globalFilter]);

  const fetchData = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/follower-history${param}`, { cache: 'no-store' });
      const json = await res.json();
      setRawData(json.history || []);
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

    const filled: { date: string; label: string; followers: number; change: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    let lastKnown = rawData[0]?.followers || 0;
    let prevFollowers = lastKnown;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const val = dataMap.get(key);
      if (val !== undefined) lastKnown = val;
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        followers: lastKnown,
        change: lastKnown - prevFollowers,
      });
      prevFollowers = lastKnown;
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

  const netChange = useMemo(() => {
    if (chartData.length < 2) return 0;
    return chartData[chartData.length - 1].followers - chartData[0].followers;
  }, [chartData]);

  const todayChange = useMemo(() => {
    if (chartData.length === 0) return 0;
    const today = chartData.find(d => d.date === todayStr);
    return today?.change ?? chartData[chartData.length - 1].change;
  }, [chartData, todayStr]);

  const bestDay = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((b, d) => (d.change > b.change ? d : b), chartData[0]);
  }, [chartData]);

  if (!loading && chartData.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2">
        <p className="text-sm text-[var(--text-muted)]">No subscriber data yet.</p>
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
            Daily Subscribers
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {loading ? '...' : (
              <>
                <span className={todayChange >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                  {todayChange >= 0 ? '+' : ''}{formatNumber(todayChange)}
                </span>{' '}
                <span className="text-sm font-medium text-[var(--text-muted)]">today</span>
                {chartData.length > 1 && (
                  <span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
                    · <span className={netChange >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                      {netChange >= 0 ? '+' : ''}{formatNumber(netChange)}
                    </span> net
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bestDay && bestDay.change > 0 && (
            <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
              Best: <span className="font-semibold text-emerald-500">+{formatNumber(bestDay.change)}</span>
              <span className="mx-1">on</span>
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
              tickFormatter={(v: number) => (v > 0 ? '+' : '') + formatNumber(v)}
              axisLine={false}
              tickLine={false}
              width={40}
              allowDecimals={false}
            />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
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
              formatter={(v: number) => {
                const label = v > 0 ? `+${formatNumber(v)}` : v < 0 ? formatNumber(v) : '0';
                return [label, 'Subscribers'];
              }}
            />
            {todayStr && (
              <ReferenceLine
                x={chartData.find(d => d.date === todayStr)?.label}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            <Bar dataKey="change" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={
                    entry.date === todayStr
                      ? TODAY_COLOR
                      : entry.change > 0
                        ? GAIN
                        : entry.change < 0
                          ? LOSS
                          : 'var(--border)'
                  }
                  fillOpacity={entry.date === todayStr ? 1 : entry.change === 0 ? 0.3 : 0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
