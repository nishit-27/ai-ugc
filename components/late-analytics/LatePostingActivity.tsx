'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type DailyMetric = {
  date: string;
  postCount: number;
  metrics: Record<string, number>;
};

type Props = {
  dailyMetrics: DailyMetric[];
};

export default function LatePostingActivity({ dailyMetrics }: Props) {
  const { chartData, totalPosts, peak } = useMemo(() => {
    if (dailyMetrics.length === 0) return { chartData: [], totalPosts: 0, peak: { date: '', posts: 0 } };

    const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
    const nowStr = new Date().toISOString().split('T')[0];

    // Build date map
    const dayMap = new Map<string, number>();
    for (const d of sorted) {
      dayMap.set(d.date, (dayMap.get(d.date) || 0) + d.postCount);
    }

    // Fill missing dates across the full range
    const data: { date: string; posts: number; isToday: boolean }[] = [];
    const cursor = new Date(sorted[0].date + 'T00:00:00');
    const end = new Date(sorted[sorted.length - 1].date + 'T00:00:00');
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0];
      data.push({ date: dateStr, posts: dayMap.get(dateStr) || 0, isToday: dateStr === nowStr });
      cursor.setDate(cursor.getDate() + 1);
    }

    let total = 0;
    let peakDay = { date: '', posts: 0 };
    for (const d of data) {
      total += d.posts;
      if (d.posts > peakDay.posts) peakDay = d;
    }

    return { chartData: data, totalPosts: total, peak: peakDay };
  }, [dailyMetrics]);

  const totalDays = chartData.length;

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (totalDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const tickInterval = totalDays <= 7 ? 0 : totalDays <= 31 ? 2 : totalDays <= 90 ? 6 : Math.max(1, Math.floor(totalDays / 15));

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Posting Activity</h3>
        <div className="flex items-center justify-center h-48 text-sm text-[var(--text-muted)]">No posting data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Posting Activity</h3>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{totalPosts.toLocaleString()} <span className="text-sm font-normal text-[var(--text-muted)]">total posts</span></div>
        </div>
        {peak.posts > 0 && (
          <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-full px-3 py-1">
            Peak: <strong className="text-[var(--text-primary)]">{peak.posts}</strong> on <strong className="text-[var(--text-primary)]">{new Date(peak.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={formatDateLabel} interval={tickInterval} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            formatter={(value: number) => [value, 'Posts']}
          />
          <Bar dataKey="posts" radius={[4, 4, 0, 0]} fill="#f59e0b" />
          {chartData.some(d => d.isToday) && (
            <ReferenceLine x={new Date().toISOString().split('T')[0]} stroke="var(--primary)" strokeDasharray="4 4" />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
