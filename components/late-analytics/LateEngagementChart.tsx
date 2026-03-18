'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import LateChartTooltip from './LateChartTooltip';

type DailyMetric = {
  date: string;
  postCount: number;
  metrics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    views: number;
  };
};

const METRIC_CONFIG = [
  { key: 'views', color: '#3b82f6', label: 'Views' },
  { key: 'likes', color: '#22c55e', label: 'Likes' },
  { key: 'comments', color: '#f59e0b', label: 'Comments' },
  { key: 'shares', color: '#8b5cf6', label: 'Shares' },
  { key: 'impressions', color: '#ec4899', label: 'Impressions' },
] as const;

export default function LateEngagementChart({ dailyMetrics }: { dailyMetrics: DailyMetric[] }) {
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(['views', 'likes', 'comments']));

  const toggleMetric = (key: string) => {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartData = dailyMetrics.map(d => ({
    date: d.date,
    ...d.metrics,
  }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Engagement Over Time</h3>
        <div className="flex items-center justify-center h-48 text-sm text-[var(--text-muted)]">No engagement data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Engagement Over Time</h3>
        <div className="flex gap-2">
          {METRIC_CONFIG.map(m => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: activeMetrics.has(m.key) ? `${m.color}20` : 'var(--bg-tertiary)',
                color: activeMetrics.has(m.key) ? m.color : 'var(--text-muted)',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeMetrics.has(m.key) ? m.color : 'var(--text-muted)' }} />
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip
            wrapperStyle={{ outline: 'none', zIndex: 20 }}
            content={(
              <LateChartTooltip
                formatLabel={(value) => new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              />
            )}
          />
          {METRIC_CONFIG.filter(m => activeMetrics.has(m.key)).map(m => (
            <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
