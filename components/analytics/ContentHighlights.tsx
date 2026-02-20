'use client';

import NumberFlow from '@number-flow/react';
import { Trophy, Flame, BarChart3, CalendarClock, ExternalLink } from 'lucide-react';
import type { AnalyticsOverview, AnalyticsMediaItem } from '@/types';

export default function ContentHighlights({
  overview,
  items,
}: {
  overview: AnalyticsOverview | null;
  items: AnalyticsMediaItem[];
}) {
  if (!overview || items.length === 0) return null;

  const bestVideo = items[0];
  const bestPlatform = overview.platformBreakdown.reduce(
    (best, p) => (p.engagementRate > (best?.engagementRate || 0) ? p : best),
    overview.platformBreakdown[0],
  );
  const totalVideos = overview.totalVideos || items.length;
  const avgViews = totalVideos > 0 ? Math.round(overview.totalViews / totalVideos) : 0;
  const recentPost = overview.latestPost;

  const highlights = [
    {
      icon: Trophy,
      accent: '#f59e0b',
      label: 'Best Performing',
      value: bestVideo?.views || 0,
      suffix: ' views',
      detail: bestVideo?.title || bestVideo?.caption?.slice(0, 30) || 'Untitled',
      url: bestVideo?.url || null,
    },
    {
      icon: Flame,
      accent: '#d4698e',
      label: 'Top Platform',
      value: bestPlatform?.engagementRate || 0,
      suffix: '% eng.',
      isFixed: true,
      detail: bestPlatform?.platform
        ? bestPlatform.platform.charAt(0).toUpperCase() + bestPlatform.platform.slice(1)
        : '—',
      url: null,
    },
    {
      icon: BarChart3,
      accent: '#22c55e',
      label: 'Avg Views',
      value: avgViews,
      suffix: '',
      detail: `${totalVideos} videos tracked`,
      url: null,
    },
    {
      icon: CalendarClock,
      accent: '#ef4444',
      label: 'Latest Post',
      value: null as number | null,
      dateValue: recentPost?.publishedAt
        ? new Date(recentPost.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—',
      detail: recentPost?.title || recentPost?.caption?.slice(0, 30) || 'No posts yet',
      url: recentPost?.url || null,
    },
  ];

  return (
    <>
      {highlights.map((h) => {
        const HIcon = h.icon;

        return (
          <div key={h.label} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <HIcon className="h-3.5 w-3.5 shrink-0" style={{ color: h.accent }} />
              <span className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {h.label}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5">
              {h.value !== null ? (
                <span className="text-lg font-bold leading-none tracking-tight">
                  <NumberFlow
                    value={h.isFixed ? Number((h.value).toFixed(1)) : h.value}
                    format={
                      h.isFixed
                        ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
                        : { notation: 'compact', maximumFractionDigits: 1 }
                    }
                  />
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">{h.suffix}</span>
                </span>
              ) : (
                <span className="text-lg font-bold leading-none tracking-tight">{h.dateValue}</span>
              )}
            </div>

            {h.url ? (
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
              >
                <span className="max-w-[120px] truncate">{h.detail}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            ) : (
              <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{h.detail}</p>
            )}
          </div>
        );
      })}
    </>
  );
}
