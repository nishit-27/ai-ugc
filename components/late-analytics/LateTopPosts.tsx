'use client';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaLinkedin } from 'react-icons/fa6';
import { MessageCircle } from 'lucide-react';

const PLATFORM_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube, facebook: FaFacebook, linkedin: FaLinkedin,
};

type Post = {
  postId: string;
  content: string;
  publishedAt: string;
  analytics: { likes: number; comments: number; shares: number; views: number; impressions: number };
  platforms?: unknown[] | Record<string, unknown>;
};

export default function LateTopPosts({ posts }: { posts: Post[] }) {
  // Sort by total engagement
  const sorted = [...posts].sort((a, b) => {
    const ea = (a.analytics?.likes || 0) + (a.analytics?.comments || 0) + (a.analytics?.shares || 0);
    const eb = (b.analytics?.likes || 0) + (b.analytics?.comments || 0) + (b.analytics?.shares || 0);
    return eb - ea;
  }).slice(0, 5);

  if (!sorted.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Top Performing Posts</h3>
      <div className="space-y-3">
        {sorted.map((post, i) => {
          const engagement = (post.analytics?.likes || 0) + (post.analytics?.comments || 0) + (post.analytics?.shares || 0);
          const er = post.analytics?.views > 0 ? ((engagement / post.analytics.views) * 100) : 0;
          const platform = Array.isArray(post.platforms) ? (post.platforms[0] as Record<string, string>)?.platform || '' : (post.platforms ? Object.keys(post.platforms)[0] : '');
          const Icon = PLATFORM_ICONS[platform];
          return (
            <div key={`${post.postId}-${i}`} className="flex items-center gap-3">
              <span className="text-sm font-bold text-[var(--text-muted)] w-5 text-right">{i + 1}</span>
              {Icon ? <Icon className="h-4 w-4 text-[var(--text-secondary)] shrink-0" /> : <div className="w-4" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] truncate">{post.content?.slice(0, 50) || 'Untitled'}{post.content?.length > 50 ? '...' : ''}</div>
                <div className="text-xs text-[var(--text-muted)]">{new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              </div>
              <span className="text-xs font-medium rounded-full border border-[var(--border)] px-2 py-0.5 text-emerald-600">ER {er.toFixed(2)}%</span>
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><MessageCircle className="h-3 w-3" />{engagement}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
