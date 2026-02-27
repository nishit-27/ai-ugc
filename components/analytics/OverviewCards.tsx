'use client';

import NumberFlow from '@number-flow/react';
import { Users, Eye, TrendingUp, Heart, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { AnalyticsOverview, AnalyticsSnapshot } from '@/types';

function getDelta(current: number, history: AnalyticsSnapshot[], key: keyof AnalyticsSnapshot): number | null {
  if (history.length < 2) return null;
  const prev = Number(history[0][key]) || 0;
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const metrics = [
  {
    key: 'followers',
    label: 'Followers',
    icon: Users,
    accent: '#d4698e',
    getValue: (o: AnalyticsOverview) => o.totalFollowers,
    historyKey: 'followers' as keyof AnalyticsSnapshot,
    getDetail: (o: AnalyticsOverview) => `${o.accountCount} account${o.accountCount !== 1 ? 's' : ''}`,
  },
  {
    key: 'views',
    label: 'Total Views',
    icon: Eye,
    accent: '#f59e0b',
    getValue: (o: AnalyticsOverview) => o.totalViews,
    historyKey: 'totalViews' as keyof AnalyticsSnapshot,
    getDetail: (o: AnalyticsOverview) => `${(o.platformBreakdown || []).length} platform${(o.platformBreakdown || []).length !== 1 ? 's' : ''}`,
  },
  {
    key: 'engagement',
    label: 'Engagement',
    icon: TrendingUp,
    accent: '#22c55e',
    getValue: (o: AnalyticsOverview) => o.avgEngagementRate,
    historyKey: 'engagementRate' as keyof AnalyticsSnapshot,
    isPercentage: true,
    getDetail: (o: AnalyticsOverview) => `${formatCompact(o.totalInteractions)} interactions`,
  },
  {
    key: 'interactions',
    label: 'Interactions',
    icon: Heart,
    accent: '#ef4444',
    getValue: (o: AnalyticsOverview) => o.totalInteractions,
    historyKey: 'totalLikes' as keyof AnalyticsSnapshot,
    getDetail: (o: AnalyticsOverview) => `${formatCompact(o.totalViews)} total views`,
  },
];

export default function OverviewCards({
  overview,
  history = [],
}: {
  overview: AnalyticsOverview | null;
  history?: AnalyticsSnapshot[];
}) {
  return (
    <>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const value = overview ? metric.getValue(overview) : 0;
        const delta = overview ? getDelta(value, history, metric.historyKey) : null;
        const isPositive = delta !== null && delta >= 0;

        return (
          <div key={metric.key} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: metric.accent }} />
              <span className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {metric.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              {overview ? (
                metric.isPercentage ? (
                  <span className="text-lg font-bold leading-none tracking-tight">
                    <NumberFlow value={Number(value.toFixed(2))} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                    <span className="text-[11px] text-[var(--text-muted)]">%</span>
                  </span>
                ) : (
                  <span className="text-lg font-bold leading-none tracking-tight">
                    <NumberFlow value={value} format={{ notation: 'compact', maximumFractionDigits: 1 }} />
                  </span>
                )
              ) : (
                <span className="text-lg font-bold leading-none tracking-tight text-[var(--text-muted)]">—</span>
              )}
              {delta !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                    isPositive ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              {overview ? metric.getDetail(overview) : '\u00A0'}
            </p>
          </div>
        );
      })}
    </>
  );
}
