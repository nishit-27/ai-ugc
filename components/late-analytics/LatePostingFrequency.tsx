'use client';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaLinkedin } from 'react-icons/fa6';

const PLATFORM_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube, facebook: FaFacebook, linkedin: FaLinkedin,
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'border-cyan-400 text-cyan-600',
  instagram: 'border-pink-400 text-pink-600',
  youtube: 'border-red-400 text-red-600',
  facebook: 'border-blue-400 text-blue-600',
  linkedin: 'border-blue-500 text-blue-700',
};

type FreqData = { platform: string; postsPerWeek: number; averageEngagementRate: number; sampleSize?: number; weeksCount?: number };

export default function LatePostingFrequency({ data }: { data: FreqData[] }) {
  if (!data.length) return null;

  // Group by platform, pick highest ER entry
  const byPlatform = new Map<string, FreqData>();
  for (const d of data) {
    const existing = byPlatform.get(d.platform);
    if (!existing || d.averageEngagementRate > existing.averageEngagementRate) {
      byPlatform.set(d.platform, d);
    }
  }

  const entries = Array.from(byPlatform.values()).sort((a, b) => b.averageEngagementRate - a.averageEngagementRate);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Posting Frequency vs Engagement</h3>
      <div className="space-y-3">
        {entries.map(d => {
          const Icon = PLATFORM_ICONS[d.platform];
          const colorClass = PLATFORM_COLORS[d.platform] || 'border-gray-400 text-gray-600';
          return (
            <div key={d.platform} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
              {Icon && <Icon className="h-5 w-5 text-[var(--text-secondary)]" />}
              <span className="text-sm font-medium capitalize text-[var(--text-primary)]">{d.platform}</span>
              <span className={`ml-auto text-xs font-medium rounded-full border px-2.5 py-0.5 ${colorClass}`}>
                {d.postsPerWeek || 0}+/wk: ER {(d.averageEngagementRate || 0).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      {entries.length > 0 && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Optimal posting frequency: {entries[0].postsPerWeek || 0}+ posts/week on {entries[0].platform} ({(entries[0].averageEngagementRate || 0).toFixed(1)}% ER)
        </p>
      )}
    </div>
  );
}
