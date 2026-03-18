'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import LateChartTooltip from './LateChartTooltip';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea',
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
};

type FollowerStat = {
  platform: string;
  followerCount: number;
  followerGrowth?: number;
  growthRate?: number;
};

export default function LateFollowerChart({ followerStats, totalFollowers }: { followerStats: FollowerStat[]; totalFollowers: number }) {
  if (!followerStats.length) return null;

  // Aggregate by platform (not individual accounts)
  const byPlatform = new Map<string, { followers: number; growth: number }>();
  for (const s of followerStats) {
    const existing = byPlatform.get(s.platform) || { followers: 0, growth: 0 };
    existing.followers += s.followerCount || 0;
    existing.growth += s.followerGrowth || 0;
    byPlatform.set(s.platform, existing);
  }

  const platformData = Array.from(byPlatform.entries())
    .map(([platform, data]) => ({ platform, ...data }))
    .sort((a, b) => b.followers - a.followers);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="mb-4">
        <span className="text-2xl font-bold text-[var(--text-primary)] font-mono">{formatK(totalFollowers)}</span>
        <span className="ml-2 text-sm text-[var(--text-muted)]">total followers</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {platformData.map(d => (
          <div key={d.platform} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-center">
            <div className="text-xs text-[var(--text-muted)] capitalize mb-1">{d.platform}</div>
            <div className="text-xl font-bold text-[var(--text-primary)] font-mono">{formatK(d.followers)}</div>
            {d.growth !== 0 && (
              <div className={`text-xs font-medium ${d.growth > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {d.growth > 0 ? '+' : ''}{formatK(d.growth)}
              </div>
            )}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={platformData} layout="vertical" margin={{ left: 60 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatK} />
          <YAxis type="category" dataKey="platform" tick={{ fontSize: 11 }} tickFormatter={p => p.charAt(0).toUpperCase() + p.slice(1)} />
          <Tooltip
            wrapperStyle={{ outline: 'none', zIndex: 20 }}
            cursor={{ fill: 'rgba(113, 113, 122, 0.14)' }}
            content={(
              <LateChartTooltip
                formatLabel={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                formatName={() => 'Followers'}
                formatValue={(value) => formatK(value)}
              />
            )}
          />
          <Bar dataKey="followers" radius={[0, 4, 4, 0]}>
            {platformData.map((d, i) => (
              <Cell key={i} fill={PLATFORM_COLORS[d.platform] || '#888'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}
