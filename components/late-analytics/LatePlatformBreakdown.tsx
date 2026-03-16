'use client';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaLinkedin } from 'react-icons/fa6';
import { Heart, MessageCircle, Share2, Eye } from 'lucide-react';

const PLATFORM_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube, facebook: FaFacebook, linkedin: FaLinkedin,
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

type PlatformData = { posts: number; likes: number; comments: number; shares: number; views: number; impressions: number; reach: number };
type FollowerStat = { platform: string; followerCount: number; followerGrowth?: number; growthRate?: number };

export default function LatePlatformBreakdown({ platforms, totalFollowers, followerStats }: { platforms: Record<string, PlatformData>; totalFollowers: number; followerStats: FollowerStat[] }) {
  const entries = Object.entries(platforms).sort((a, b) => b[1].views - a[1].views);
  if (!entries.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Platform Breakdown</h3>
      <div className="space-y-3">
        {entries.map(([platform, data]) => {
          const Icon = PLATFORM_ICONS[platform];
          const er = data.views > 0 ? ((data.likes + data.comments + data.shares) / data.views * 100) : 0;
          return (
            <div key={platform} className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="flex items-center gap-2 min-w-[120px]">
                {Icon && <Icon className="h-5 w-5 text-[var(--text-secondary)]" />}
                <div>
                  <div className="text-sm font-medium capitalize text-[var(--text-primary)]">{platform}</div>
                  <div className="text-xs text-[var(--text-muted)]">{data.posts} posts</div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-1 text-xs text-[var(--text-secondary)]">
                <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-500" />{formatNum(data.likes)}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-blue-500" />{formatNum(data.comments)}</span>
                <span className="flex items-center gap-1"><Share2 className="h-3 w-3 text-green-500" />{formatNum(data.shares)}</span>
                <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-purple-500" />{formatNum(data.views)}</span>
              </div>
              <span className="text-xs font-medium rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-secondary)]">
                ER {er.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
