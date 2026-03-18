'use client';
import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { listDateKeysInRange } from '@/lib/dateUtils';
import LateChartTooltip from './LateChartTooltip';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea',
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
};

type DailyMetric = {
  date: string;
  postCount: number;
  metrics: { likes: number; comments: number; shares: number; views: number; impressions: number };
  platforms?: Record<string, number>;
};

export default function LateDailyChart({
  dailyMetrics,
  dateRange,
}: {
  dailyMetrics: DailyMetric[];
  dateRange?: { fromDate: string; toDate: string };
}) {
  const { data, platforms, totalPosts } = useMemo(() => {
    const platformSet = new Set<string>();
    const dayMap = new Map<string, DailyMetric>();

    for (const day of dailyMetrics) {
      dayMap.set(day.date, day);
      if (day.platforms) Object.keys(day.platforms).forEach((platform) => platformSet.add(platform));
    }

    const sortedDates = [...dayMap.keys()].sort();
    const fillFrom = dateRange?.fromDate || sortedDates[0];
    const fillTo = dateRange?.toDate || sortedDates[sortedDates.length - 1];
    const platformKeys = Array.from(platformSet).sort();

    const filledData = listDateKeysInRange(fillFrom, fillTo).map((date) => {
      const day = dayMap.get(date);
      const entry: Record<string, unknown> = {
        date,
        views: day?.metrics?.views || 0,
        postCount: day?.postCount || 0,
      };
      for (const platform of platformKeys) {
        entry[platform] = day?.platforms?.[platform] || 0;
      }
      return entry;
    });

    return {
      data: filledData,
      platforms: platformKeys,
      totalPosts: dailyMetrics.reduce((sum, day) => sum + day.postCount, 0),
    };
  }, [dailyMetrics, dateRange]);

  if (!dailyMetrics.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Daily Posts by Platform</h3>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{totalPosts.toLocaleString()} <span className="text-sm font-normal text-[var(--text-muted)]">total posts</span></div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={d => {
              const dt = new Date(d + 'T00:00:00');
              return dt.getDate().toString();
            }}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v)} />
          <Tooltip
            wrapperStyle={{ outline: 'none', zIndex: 20 }}
            cursor={{ fill: 'rgba(113, 113, 122, 0.14)' }}
            content={(
              <LateChartTooltip
                formatLabel={(value) => new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                formatValue={(value) => value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value}
              />
            )}
          />
          <Legend />
          {platforms.map((p, i) => (
            <Bar
              key={p}
              dataKey={p}
              stackId="posts"
              fill={PLATFORM_COLORS[p] || '#888'}
              name={p.charAt(0).toUpperCase() + p.slice(1)}
              radius={i === platforms.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
