'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts';

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

export default function LateDailyChart({ dailyMetrics }: { dailyMetrics: DailyMetric[] }) {
  if (!dailyMetrics.length) return null;

  // Get all platforms
  const platformSet = new Set<string>();
  for (const d of dailyMetrics) {
    if (d.platforms) Object.keys(d.platforms).forEach(p => platformSet.add(p));
  }
  const platforms = Array.from(platformSet).sort();

  // Build data with stacked platform post counts AND total views
  const data = dailyMetrics.map(d => {
    const entry: Record<string, unknown> = {
      date: d.date,
      views: d.metrics?.views || 0,
      postCount: d.postCount || 0,
    };
    for (const p of platforms) {
      entry[p] = d.platforms?.[p] || 0;
    }
    return entry;
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      {/* Views bar chart */}
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
            contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v, name]}
            labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
