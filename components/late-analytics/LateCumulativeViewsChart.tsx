'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { listDateKeysInRange, getDateKeyInTimeZone } from '@/lib/dateUtils';

type PostAnalytics = {
  postId: string;
  publishedAt: string;
  variableValues?: Record<string, string>;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: { views: number; likes: number; comments: number; shares: number; impressions: number; reach: number; saves: number; clicks: number };
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function LateCumulativeViewsChart({
  allPosts,
  runnablePosts,
  dateRange,
}: {
  allPosts: PostAnalytics[];
  runnablePosts: PostAnalytics[];
  dateRange: { fromDate: string; toDate: string };
}) {
  const chartData = useMemo(() => {
    const dates = listDateKeysInRange(dateRange.fromDate, dateRange.toDate);

    // Build daily views maps
    const allDayViews = new Map<string, number>();
    const runDayViews = new Map<string, number>();

    for (const post of allPosts) {
      if (!post.publishedAt) continue;
      const date = getDateKeyInTimeZone(post.publishedAt);
      allDayViews.set(date, (allDayViews.get(date) || 0) + (post.analytics.views || 0));
    }
    for (const post of runnablePosts) {
      if (!post.publishedAt) continue;
      const date = getDateKeyInTimeZone(post.publishedAt);
      runDayViews.set(date, (runDayViews.get(date) || 0) + (post.analytics.views || 0));
    }

    // Accumulate
    let cumAll = 0;
    let cumRun = 0;
    return dates.map((date) => {
      cumAll += allDayViews.get(date) || 0;
      cumRun += runDayViews.get(date) || 0;
      return { date, totalViews: cumAll, runableViews: cumRun };
    });
  }, [allPosts, runnablePosts, dateRange]);

  const lastPoint = chartData[chartData.length - 1];
  const totalAll = lastPoint?.totalViews || 0;
  const totalRun = lastPoint?.runableViews || 0;

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Cumulative Views</h3>
        <div className="flex items-center justify-center h-48 text-sm text-[var(--text-muted)]">No data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cumulative Views</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[var(--text-muted)]">Total</span>
            <span className="font-semibold text-[var(--text-primary)]">{formatNum(totalAll)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
            <span className="text-[var(--text-muted)]">Runable</span>
            <span className="font-semibold text-[var(--text-primary)]">{formatNum(totalRun)}</span>
          </div>
          {totalAll > 0 && (
            <span className="text-[var(--text-muted)]">
              ({((totalRun / totalAll) * 100).toFixed(1)}% from Runable)
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRunable" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => formatNum(v)} />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1f2937' }}
            labelFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            formatter={(value: number, name: string) => [
              formatNum(value),
              name === 'totalViews' ? 'Total Views' : 'Runable Views',
            ]}
          />
          <Legend
            formatter={(value) => (value === 'totalViews' ? 'Total Views' : 'Runable Views')}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="totalViews"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#gradTotal)"
            name="totalViews"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="runableViews"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#gradRunable)"
            name="runableViews"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
