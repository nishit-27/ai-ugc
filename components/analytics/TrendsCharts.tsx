'use client';

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  PieChartIcon, TrendingUp,
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

const FILTERS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '3m', days: 90 },
  { label: 'All', days: 0 },
] as const;

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
  const [pieFilter, setPieFilter] = useState(0); // 0 = All time

  type PlatformData = { platform: string; views: number; likes: number; comments: number; shares: number; videoCount: number; followers: number };
  const [piePlatforms, setPiePlatforms] = useState<PlatformData[]>([]);
  const [pieLoading, setPieLoading] = useState(true);
  const [platEngFilter, setPlatEngFilter] = useState(0);
  const [platEngData, setPlatEngData] = useState<PlatformData[]>([]);
  const [platEngLoading, setPlatEngLoading] = useState(true);
  const [contentFilter, setContentFilter] = useState(0);
  const [contentData, setContentData] = useState<PlatformData[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  // Re-fetch all charts when a sync completes (lastSyncedAt changes)
  const refreshKey = overview?.lastSyncedAt || '';

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
    setPieLoading(true);
    fetchPiePlatforms(pieFilter);
  }, [pieFilter, fetchPiePlatforms, refreshKey]);

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
  }, [platEngFilter, fetchPlatEngData, refreshKey]);

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
  }, [contentFilter, fetchContentData, refreshKey]);

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

      {/* Row 2: Views by Platform + Engagement Breakdown */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

        {/* Engagement Breakdown */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <EngagementTrend refreshKey={refreshKey} />
        </div>
      </div>

      {/* Row 3: Content Performance + Platform Engagement */}
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
            const totalVideos = src.reduce((s, p) => s + ((p as PlatformData).videoCount || 0), 0);
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
