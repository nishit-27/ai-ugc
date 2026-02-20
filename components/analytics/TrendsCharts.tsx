'use client';

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import {
  Activity, PieChartIcon, TrendingUp,
  Zap, Video, Eye, Heart, MessageCircle,
} from 'lucide-react';
import EngagementTrend from '@/components/analytics/EngagementTrend';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
import NumberFlow from '@number-flow/react';
import type { AnalyticsOverview } from '@/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const PLATFORM_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-4 w-4" />,    color: '#00f2ea' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-4 w-4" />, color: '#E1306C' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-4 w-4" />,   color: '#FF0000' },
};

const LINE_METRICS = [
  { key: 'views',    label: 'Views',    color: '#d4698e' },
  { key: 'likes',    label: 'Likes',    color: '#f59e0b' },
  { key: 'comments', label: 'Comments', color: '#22c55e' },
];

const FILTERS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '3m', days: 90 },
  { label: 'All', days: 0 },
] as const;

type DailyMetric = {
  date: string;
  posts: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

export default function TrendsCharts({
  overview,
}: {
  overview: AnalyticsOverview | null;
}) {
  const [metricsFilter, setMetricsFilter] = useState(30);
  const [engFilter, setEngFilter] = useState(30);
  const [pieFilter, setPieFilter] = useState(0); // 0 = All time
  const [metricsRaw, setMetricsRaw] = useState<DailyMetric[]>([]);
  const [engRaw, setEngRaw] = useState<DailyMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [engLoading, setEngLoading] = useState(true);

  type PlatformData = { platform: string; views: number; likes: number; comments: number; shares: number; videoCount: number; followers: number };
  const [piePlatforms, setPiePlatforms] = useState<PlatformData[]>([]);
  const [pieLoading, setPieLoading] = useState(true);
  const [platEngFilter, setPlatEngFilter] = useState(0);
  const [platEngData, setPlatEngData] = useState<PlatformData[]>([]);
  const [platEngLoading, setPlatEngLoading] = useState(true);
  const [contentFilter, setContentFilter] = useState(0);
  const [contentData, setContentData] = useState<PlatformData[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  const fetchMetrics = useCallback(async (days: number, target: 'metrics' | 'eng') => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/daily-metrics${param}`, { cache: 'no-store' });
      const json = await res.json();
      if (target === 'metrics') setMetricsRaw(json.metrics || []);
      else setEngRaw(json.metrics || []);
    } catch (e) {
      console.error('Failed to load daily metrics:', e);
    } finally {
      if (target === 'metrics') setMetricsLoading(false);
      else setEngLoading(false);
    }
  }, []);

  const fetchPiePlatforms = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/platform-breakdown${param}`, { cache: 'no-store' });
      const json = await res.json();
      setPiePlatforms(json.platforms || []);
    } catch (e) {
      console.error('Failed to load platform breakdown:', e);
    } finally {
      setPieLoading(false);
    }
  }, []);

  useEffect(() => {
    setMetricsLoading(true);
    fetchMetrics(metricsFilter, 'metrics');
  }, [metricsFilter, fetchMetrics]);

  useEffect(() => {
    setEngLoading(true);
    fetchMetrics(engFilter, 'eng');
  }, [engFilter, fetchMetrics]);

  useEffect(() => {
    setPieLoading(true);
    fetchPiePlatforms(pieFilter);
  }, [pieFilter, fetchPiePlatforms]);

  const fetchPlatEngData = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/platform-breakdown${param}`, { cache: 'no-store' });
      const json = await res.json();
      setPlatEngData(json.platforms || []);
    } catch (e) {
      console.error('Failed to load platform engagement:', e);
    } finally {
      setPlatEngLoading(false);
    }
  }, []);

  useEffect(() => {
    setPlatEngLoading(true);
    fetchPlatEngData(platEngFilter);
  }, [platEngFilter, fetchPlatEngData]);

  const fetchContentData = useCallback(async (days: number) => {
    try {
      const param = days > 0 ? `?days=${days}` : '';
      const res = await fetch(`/api/analytics/platform-breakdown${param}`, { cache: 'no-store' });
      const json = await res.json();
      setContentData(json.platforms || []);
    } catch (e) {
      console.error('Failed to load content performance:', e);
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    setContentLoading(true);
    fetchContentData(contentFilter);
  }, [contentFilter, fetchContentData]);

  // Fill in missing dates for continuous timeline
  const chartData = useMemo(() => {
    if (metricsRaw.length === 0) return [];

    const dataMap = new Map(metricsRaw.map(d => [d.date, d]));
    const allDates = metricsRaw.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; views: number; likes: number; comments: number; shares: number; engagement: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const entry = dataMap.get(key);
      const views = entry?.views || 0;
      const likes = entry?.likes || 0;
      const comments = entry?.comments || 0;
      const shares = entry?.shares || 0;
      const interactions = likes + comments + shares;
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        views,
        likes,
        comments,
        shares,
        engagement: views > 0 ? Number(((interactions / views) * 100).toFixed(2)) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return filled;
  }, [metricsRaw]);

  // Separate chart data for engagement (independent filter)
  const engChartData = useMemo(() => {
    if (engRaw.length === 0) return [];

    const dataMap = new Map(engRaw.map(d => [d.date, d]));
    const allDates = engRaw.map(d => d.date).sort();
    const start = new Date(allDates[0] + 'T00:00:00');
    const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > end) end.setTime(now.getTime());

    const filled: { date: string; label: string; engagement: number }[] = [];
    const cursor = new Date(start);
    const totalSpanDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    while (cursor <= end) {
      const key = toLocalDateStr(cursor);
      const entry = dataMap.get(key);
      const views = entry?.views || 0;
      const interactions = (entry?.likes || 0) + (entry?.comments || 0) + (entry?.shares || 0);
      filled.push({
        date: key,
        label: formatDateLabel(key, totalSpanDays),
        engagement: views > 0 ? Number(((interactions / views) * 100).toFixed(2)) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return filled;
  }, [engRaw]);

  // Tick intervals for each chart
  const metricsTickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 7) return 0;
    if (len <= 31) return Math.ceil(len / 10) - 1;
    if (len <= 90) return Math.ceil(len / 12) - 1;
    return Math.ceil(len / 10) - 1;
  }, [chartData]);

  const engTickInterval = useMemo(() => {
    const len = engChartData.length;
    if (len <= 7) return 0;
    if (len <= 31) return Math.ceil(len / 10) - 1;
    if (len <= 90) return Math.ceil(len / 12) - 1;
    return Math.ceil(len / 10) - 1;
  }, [engChartData]);

  // Peak day stats
  const peakViews = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((b, d) => (d.views > b.views ? d : b), chartData[0]);
  }, [chartData]);

  const breakdown = overview?.platformBreakdown || [];
  // Pie chart uses date-filtered platform data
  const pieSource = piePlatforms.length > 0 ? piePlatforms : breakdown;
  const pieData = pieSource.map(p => ({
    name: PLATFORM_META[p.platform]?.label || p.platform,
    value: p.views,
    color: PLATFORM_META[p.platform]?.color || '#9ca3af',
  }));
  const totalPieViews = pieData.reduce((sum, d) => sum + d.value, 0);

  // Summary stats from overview
  const summaryStats = useMemo(() => {
    if (!overview) return null;
    const totalInteractions = breakdown.reduce((s, p) => s + p.likes + p.comments + p.shares, 0);
    return {
      followers: overview.totalFollowers,
      views: overview.totalViews,
      videos: overview.totalVideos,
      engagement: overview.avgEngagementRate,
      interactions: totalInteractions,
      platforms: breakdown.length,
      accounts: overview.accountCount,
    };
  }, [overview, breakdown]);

  const tooltipLabelFormatter = useCallback((_: string, payload: Array<{ payload?: { date?: string } }>) => {
    const entry = payload?.[0]?.payload;
    if (!entry?.date) return '';
    const d = new Date(entry.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  return (
    <div className="space-y-5">
      {/* Row 1: Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Followers', value: summaryStats.followers, icon: TrendingUp, accent: '#d4698e', detail: `${summaryStats.accounts} account${summaryStats.accounts !== 1 ? 's' : ''}` },
            { label: 'Total Views', value: summaryStats.views, icon: Eye, accent: '#f59e0b', detail: `${summaryStats.platforms} platform${summaryStats.platforms !== 1 ? 's' : ''}` },
            { label: 'Total Videos', value: summaryStats.videos, icon: Video, accent: '#8b5cf6', detail: `${Math.round(summaryStats.views / Math.max(summaryStats.videos, 1)).toLocaleString()} avg views` },
            { label: 'Engagement Rate', value: summaryStats.engagement, icon: Zap, accent: '#22c55e', isPercentage: true, detail: `${summaryStats.interactions.toLocaleString()} interactions` },
          ].map(s => {
            const SIcon = s.icon;
            return (
              <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <SIcon className="h-3.5 w-3.5" style={{ color: s.accent }} />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {s.label}
                  </span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {s.isPercentage ? (
                    <><NumberFlow value={Number(s.value.toFixed(2))} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} /><span className="text-sm text-[var(--text-muted)]">%</span></>
                  ) : (
                    <NumberFlow value={s.value} />
                  )}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{s.detail}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Row 2: Metrics Over Time + Views by Platform */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Metrics Over Time — per-day from all media items */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--primary)]" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Metrics Over Time
              </p>
            </div>
            <div className="flex items-center gap-3">
              {peakViews && peakViews.views > 0 && (
                <span className="hidden rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] lg:inline-flex">
                  Peak: <span className="ml-1 font-semibold text-[var(--foreground)]">{formatNumber(peakViews.views)}</span>
                  <span className="mx-1">on</span>
                  <span className="font-semibold text-[var(--foreground)]">
                    {new Date(peakViews.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </span>
              )}
              <FilterButtons filter={metricsFilter} setFilter={setMetricsFilter} />
            </div>
          </div>

          <div className="mb-3 flex items-center gap-3">
            {LINE_METRICS.map(m => (
              <div key={m.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="text-[10px] text-[var(--text-muted)]">{m.label}</span>
              </div>
            ))}
          </div>

          {metricsLoading || chartData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
              {metricsLoading ? 'Loading...' : 'No data yet. Sync to build history.'}
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    {LINE_METRICS.map(m => (
                      <linearGradient key={m.key} id={`trend-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={m.color} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={metricsTickInterval}
                  />
                  <YAxis tickFormatter={formatNumber} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }} labelStyle={{ color: 'var(--foreground)' }} itemStyle={{ color: 'var(--foreground)' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={(v: number, name: string) => [formatNumber(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                    cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {LINE_METRICS.map(m => (
                    <Area
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      stroke={m.color}
                      strokeWidth={2}
                      fill={`url(#trend-${m.key})`}
                      dot={false}
                      activeDot={{ r: 3, fill: m.color, stroke: 'var(--background)', strokeWidth: 2 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Views by Platform */}
        {(pieData.length > 0 || pieLoading) && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-[var(--primary)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Views by Platform
                </p>
              </div>
              <FilterButtons filter={pieFilter} setFilter={setPieFilter} />
            </div>
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }} labelStyle={{ color: 'var(--foreground)' }} itemStyle={{ color: 'var(--foreground)' }}
                      formatter={(v: number) => [formatNumber(v), 'Views']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                {pieSource.map(p => {
                  const meta = PLATFORM_META[p.platform];
                  const pct = totalPieViews > 0 ? ((p.views / totalPieViews) * 100) : 0;
                  return (
                    <div key={p.platform} className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${meta?.color || '#9ca3af'}12`, color: meta?.color || '#9ca3af' }}
                      >
                        {meta?.icon || <span className="text-xs font-bold">{p.platform[0].toUpperCase()}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{meta?.label || p.platform}</span>
                          <span className="text-sm font-bold">
                            <NumberFlow value={Number(pct.toFixed(1))} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: meta?.color || '#9ca3af' }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                          <span>{formatNumber(p.views)} views</span>
                          <span>{formatNumber(p.followers)} followers</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Engagement Rate Over Time + Engagement Breakdown */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Engagement Rate Over Time — per-day from all media items */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#22c55e]" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Engagement Rate Over Time
              </p>
            </div>
            <FilterButtons filter={engFilter} setFilter={setEngFilter} />
          </div>
          {engLoading || engChartData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text-muted)]">
              {engLoading ? 'Loading...' : 'No data yet.'}
            </div>
          ) : (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={engChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="engFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={engTickInterval}
                  />
                  <YAxis
                    tickFormatter={(v: number) => v.toFixed(1) + '%'}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }} labelStyle={{ color: 'var(--foreground)' }} itemStyle={{ color: 'var(--foreground)' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={(v: number) => [v.toFixed(2) + '%', 'Engagement']}
                    cursor={{ stroke: '#22c55e', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="engagement"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#engFill)"
                    dot={false}
                    activeDot={{ r: 3, fill: '#22c55e', stroke: 'var(--background)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Engagement Breakdown */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <EngagementTrend />
        </div>
      </div>

      {/* Row 4: Content Performance + Platform Engagement */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Content Performance */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-[var(--primary)]" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Content Performance
              </p>
            </div>
            <FilterButtons filter={contentFilter} setFilter={setContentFilter} />
          </div>
          {contentLoading ? (
            <div className="flex h-[120px] items-center justify-center text-sm text-[var(--text-muted)]">
              Loading...
            </div>
          ) : (() => {
            const src = contentData.length > 0 ? contentData : breakdown;
            const totalVideos = src.reduce((s, p) => s + (p.videoCount || 0), 0);
            const totalViews = src.reduce((s, p) => s + p.views, 0);
            const totalLikes = src.reduce((s, p) => s + p.likes, 0);
            const totalComments = src.reduce((s, p) => s + p.comments, 0);
            const totalShares = src.reduce((s, p) => s + p.shares, 0);
            const avgViews = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;
            return (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Total Videos', value: totalVideos, icon: Video, accent: '#d4698e' },
                  { label: 'Total Views', value: totalViews, icon: Eye, accent: '#f59e0b' },
                  { label: 'Total Likes', value: totalLikes, icon: Heart, accent: '#ef4444' },
                  { label: 'Total Comments', value: totalComments, icon: MessageCircle, accent: '#22c55e' },
                  { label: 'Total Shares', value: totalShares, icon: Zap, accent: '#8b5cf6' },
                  { label: 'Avg Views/Video', value: avgViews, icon: Eye, accent: '#f59e0b' },
                ].map(s => {
                  const SIcon = s.icon;
                  return (
                    <div key={s.label} className="rounded-lg bg-[var(--muted)] p-3">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <SIcon className="h-3 w-3" style={{ color: s.accent }} />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{s.label}</span>
                      </div>
                      <span className="text-lg font-bold">{s.value.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Platform Engagement Comparison */}
        {(platEngData.length > 0 || platEngLoading || breakdown.length > 0) && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#22c55e]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Platform Engagement
                </p>
              </div>
              <FilterButtons filter={platEngFilter} setFilter={setPlatEngFilter} />
            </div>
            {platEngLoading ? (
              <div className="flex h-[160px] items-center justify-center text-sm text-[var(--text-muted)]">
                Loading...
              </div>
            ) : (
              <div className="space-y-4">
                {(platEngData.length > 0 ? platEngData : breakdown).map(p => {
                  const meta = PLATFORM_META[p.platform];
                  const engRate = p.views > 0 ? ((p.likes + p.comments + p.shares) / p.views) * 100 : 0;
                  const source = platEngData.length > 0 ? platEngData : breakdown;
                  const maxEng = Math.max(...source.map(b => {
                    const r = b.views > 0 ? ((b.likes + b.comments + b.shares) / b.views) * 100 : 0;
                    return r;
                  }), 1);
                  const barPct = (engRate / maxEng) * 100;
                  return (
                    <div key={p.platform}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span style={{ color: meta?.color || '#9ca3af' }}>
                            {meta?.icon || <span className="text-xs font-bold">{p.platform[0].toUpperCase()}</span>}
                          </span>
                          <span className="text-sm font-medium">{meta?.label || p.platform}</span>
                        </div>
                        <span className="text-sm font-bold">{engRate.toFixed(2)}%</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(barPct, 3)}%`, backgroundColor: meta?.color || '#9ca3af' }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>{formatNumber(p.likes + p.comments + p.shares)} interactions</span>
                        <span>{formatNumber(p.views)} views</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
