'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { ChevronDown } from 'lucide-react';
import { cachedFetch, invalidateAnalyticsCache } from '@/lib/analytics-cache';

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

const METRICS = [
  { key: 'posts', label: 'Posts', color: '#8b5cf6' },
  { key: 'views', label: 'Views', color: '#f59e0b' },
  { key: 'engagement', label: 'Engagement', color: '#22c55e' },
  { key: 'followers', label: 'Followers', color: '#d4698e' },
] as const;

type MetricKey = typeof METRICS[number]['key'];

const GAIN = '#22c55e';
const LOSS = '#ef4444';

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

type DailyMetric = { date: string; posts: number; views: number; likes: number; comments: number; shares: number };
type FollowerPoint = { date: string; followers: number };
type ChartPoint = { date: string; label: string; value: number; change: number };

function MetricDropdown({ value, onChange }: { value: MetricKey; onChange: (v: MetricKey) => void }) {
  const [open, setOpen] = useState(false);
  const selected = METRICS.find(m => m.key === value)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected.color }} />
        {selected.label}
        <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => { onChange(m.key); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-[var(--muted)] ${
                  value === m.key ? 'text-[var(--foreground)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterButtons({ filter, setFilter }: { filter: number; setFilter: (d: number) => void }) {
  return (
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
  );
}

function buildChartData(
  metric: MetricKey,
  dailyMetrics: DailyMetric[],
  followerData: FollowerPoint[],
): ChartPoint[] {
  if (metric === 'followers') {
    if (followerData.length === 0) return [];
    const dataMap = new Map(followerData.map(d => [d.date, d.followers]));
    const allDates = followerData.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: ChartPoint[] = [];
    const cursor = new Date(start);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    let lastKnown = followerData[0]?.followers || 0;
    let prevVal = lastKnown;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const val = dataMap.get(key);
      if (val !== undefined) lastKnown = val;
      filled.push({ date: key, label: formatDateLabel(key, totalDays), value: lastKnown, change: lastKnown - prevVal });
      prevVal = lastKnown;
      cursor.setDate(cursor.getDate() + 1);
    }
    return filled;
  }

  if (dailyMetrics.length === 0) return [];
  const dataMap = new Map(dailyMetrics.map(d => [d.date, d]));
  const allDates = dailyMetrics.map(d => d.date).sort();
  const start = new Date(allDates[0] + 'T00:00:00');
  const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (now > end) end.setTime(now.getTime());

  const filled: ChartPoint[] = [];
  const cursor = new Date(start);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  let cumulative = 0;

  while (cursor <= end) {
    const key = toLocalDateStr(cursor);
    const entry = dataMap.get(key);

    let dayValue = 0;
    if (metric === 'posts') {
      dayValue = entry?.posts || 0;
    } else if (metric === 'views') {
      dayValue = entry?.views || 0;
    } else if (metric === 'engagement') {
      const views = entry?.views || 0;
      const interactions = (entry?.likes || 0) + (entry?.comments || 0) + (entry?.shares || 0);
      dayValue = views > 0 ? Number(((interactions / views) * 100).toFixed(2)) : 0;
    }

    if (metric === 'engagement') {
      // For engagement, cumulative = running average (not sum)
      filled.push({ date: key, label: formatDateLabel(key, totalDays), value: dayValue, change: dayValue });
    } else {
      cumulative += dayValue;
      filled.push({ date: key, label: formatDateLabel(key, totalDays), value: cumulative, change: dayValue });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return filled;
}

function getTickInterval(len: number): number {
  if (len <= 7) return 0;
  if (len <= 31) return Math.ceil(len / 10) - 1;
  if (len <= 90) return Math.ceil(len / 12) - 1;
  return Math.ceil(len / 10) - 1;
}

export default function OverviewCharts({ refreshKey }: { refreshKey: string }) {
  const [dodMetric, setDodMetric] = useState<MetricKey>('views');
  const [cumMetric, setCumMetric] = useState<MetricKey>('followers');
  const [dodFilter, setDodFilter] = useState(30);
  const [cumFilter, setCumFilter] = useState(0);

  const [dodDailyMetrics, setDodDailyMetrics] = useState<DailyMetric[]>([]);
  const [dodFollowerData, setDodFollowerData] = useState<FollowerPoint[]>([]);
  const [cumDailyMetrics, setCumDailyMetrics] = useState<DailyMetric[]>([]);
  const [cumFollowerData, setCumFollowerData] = useState<FollowerPoint[]>([]);
  const [dodLoading, setDodLoading] = useState(true);
  const [cumLoading, setCumLoading] = useState(true);
  const prevRefreshKey = useRef(refreshKey);

  const fetchChartData = useCallback(async (
    days: number,
    setMetrics: (d: DailyMetric[]) => void,
    setFollowers: (d: FollowerPoint[]) => void,
    setLoading: (b: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const [metricsJson, followerJson] = await Promise.all([
        cachedFetch<{ metrics?: DailyMetric[] }>(`/api/analytics/daily-metrics${param}`),
        cachedFetch<{ history?: FollowerPoint[] }>(`/api/analytics/follower-history${param}`),
      ]);
      setMetrics(metricsJson.metrics || []);
      setFollowers(followerJson.history || []);
    } catch (e) {
      console.error('Failed to load chart data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (prevRefreshKey.current !== refreshKey) {
      invalidateAnalyticsCache();
      prevRefreshKey.current = refreshKey;
    }
    fetchChartData(dodFilter, setDodDailyMetrics, setDodFollowerData, setDodLoading);
  }, [dodFilter, fetchChartData, refreshKey]);

  useEffect(() => {
    fetchChartData(cumFilter, setCumDailyMetrics, setCumFollowerData, setCumLoading);
  }, [cumFilter, fetchChartData, refreshKey]);

  const dodData = useMemo(
    () => buildChartData(dodMetric, dodDailyMetrics, dodFollowerData),
    [dodMetric, dodDailyMetrics, dodFollowerData],
  );

  const cumData = useMemo(
    () => buildChartData(cumMetric, cumDailyMetrics, cumFollowerData),
    [cumMetric, cumDailyMetrics, cumFollowerData],
  );

  const dodColor = METRICS.find(m => m.key === dodMetric)!.color;
  const cumColor = METRICS.find(m => m.key === cumMetric)!.color;
  const isEngagementDod = dodMetric === 'engagement';
  const isEngagementCum = cumMetric === 'engagement';

  const todayStr = toLocalDateStr(new Date());

  const tooltipLabelFormatter = useCallback((_: string, payload: Array<{ payload?: { date?: string } }>) => {
    const entry = payload?.[0]?.payload;
    if (!entry?.date) return '';
    const d = new Date(entry.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Day-over-Day Chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Day over Day
            </p>
            <MetricDropdown value={dodMetric} onChange={setDodMetric} />
          </div>
          <FilterButtons filter={dodFilter} setFilter={setDodFilter} />
        </div>

        {dodLoading || dodData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
            {dodLoading ? 'Loading...' : 'No data yet. Sync accounts to start tracking.'}
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dodData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={getTickInterval(dodData.length)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickFormatter={(v: number) => {
                    if (isEngagementDod) return v.toFixed(1) + '%';
                    if (dodMetric === 'followers') return (v > 0 ? '+' : '') + formatNumber(v);
                    return formatNumber(v);
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  allowDecimals={isEngagementDod}
                />
                {dodMetric === 'followers' && <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />}
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                  labelFormatter={tooltipLabelFormatter}
                  formatter={(v: number) => {
                    if (isEngagementDod) return [v.toFixed(2) + '%', 'Engagement'];
                    if (dodMetric === 'followers') {
                      const label = v > 0 ? `+${formatNumber(v)}` : v < 0 ? formatNumber(v) : '0';
                      return [label, 'Followers'];
                    }
                    return [formatNumber(v), METRICS.find(m => m.key === dodMetric)!.label];
                  }}
                />
                <Bar dataKey="change" radius={[3, 3, 0, 0]} maxBarSize={20}>
                  {dodData.map((entry) => (
                    <Cell
                      key={entry.date}
                      fill={
                        dodMetric === 'followers'
                          ? (entry.change > 0 ? GAIN : entry.change < 0 ? LOSS : 'var(--border)')
                          : dodColor
                      }
                      fillOpacity={dodMetric === 'followers' && entry.change === 0 ? 0.3 : 0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Cumulative Chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Cumulative
            </p>
            <MetricDropdown value={cumMetric} onChange={setCumMetric} />
          </div>
          <FilterButtons filter={cumFilter} setFilter={setCumFilter} />
        </div>

        {cumLoading || cumData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
            {cumLoading ? 'Loading...' : 'No data yet. Sync accounts to start tracking.'}
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cumColor} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={cumColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={getTickInterval(cumData.length)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickFormatter={(v: number) => isEngagementCum ? v.toFixed(1) + '%' : formatNumber(v)}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                  labelFormatter={tooltipLabelFormatter}
                  formatter={(v: number) => {
                    if (isEngagementCum) return [v.toFixed(2) + '%', 'Engagement'];
                    return [formatNumber(v), METRICS.find(m => m.key === cumMetric)!.label];
                  }}
                  cursor={{ stroke: cumColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  fill="url(#cumFill)"
                  stroke={cumColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: cumColor, stroke: 'var(--background)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
