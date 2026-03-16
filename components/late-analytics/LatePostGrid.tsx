'use client';
import { ExternalLink, Copy, Eye, BarChart2, Users, Heart } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaLinkedin } from 'react-icons/fa6';

const PLATFORM_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube, facebook: FaFacebook, linkedin: FaLinkedin,
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

type Post = {
  postId: string;
  content: string;
  publishedAt: string;
  platformPostUrl?: string;
  platforms?: unknown[] | Record<string, unknown>;
  analytics: { likes: number; comments: number; shares: number; views: number; impressions: number; reach: number };
};

export default function LatePostGrid({ posts }: { posts: Post[] }) {
  if (!posts.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Post Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.slice(0, 30).map(post => {
          const engagement = (post.analytics?.likes || 0) + (post.analytics?.comments || 0) + (post.analytics?.shares || 0);
          const er = post.analytics?.views > 0 ? ((engagement / post.analytics.views) * 100) : 0;
          const platform = Array.isArray(post.platforms) ? (post.platforms[0] as Record<string, string>)?.platform || '' : (post.platforms ? Object.keys(post.platforms)[0] : '');
          const Icon = PLATFORM_ICONS[platform];

          return (
            <div key={post.postId + platform} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-4">
              <div className="flex gap-3 mb-3">
                <div className="w-16 h-16 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-muted)] shrink-0">
                  video
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">{post.content?.slice(0, 60) || 'Untitled'}...</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {post.platformPostUrl && (
                  <a href={post.platformPostUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--primary)]">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <span className="truncate">id: {post.postId?.slice(0, 6)}...</span>
                <button onClick={() => navigator.clipboard.writeText(post.postId)} className="hover:text-[var(--primary)]">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {post.analytics?.likes > 0 && <span className="flex items-center gap-1 text-xs"><Heart className="h-3 w-3 text-red-500" />{formatNum(post.analytics.likes)}</span>}
                {post.analytics?.views > 0 && <span className="flex items-center gap-1 text-xs"><Eye className="h-3 w-3 text-purple-500" />{formatNum(post.analytics.views)}</span>}
                {post.analytics?.impressions > 0 && <span className="flex items-center gap-1 text-xs"><BarChart2 className="h-3 w-3 text-cyan-500" />{formatNum(post.analytics.impressions)}</span>}
                {post.analytics?.reach > 0 && <span className="flex items-center gap-1 text-xs"><Users className="h-3 w-3 text-orange-500" />{formatNum(post.analytics.reach)}</span>}
                {er > 0 && <span className="text-xs font-medium text-emerald-600 rounded-full border border-emerald-300 px-1.5 py-0.5">ER {er.toFixed(2)}%</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
