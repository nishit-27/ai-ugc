'use client';

import { useState, useMemo } from 'react';
import { Search, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';

type PostAnalytics = {
  postId: string;
  content: string;
  publishedAt: string;
  status?: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: {
    impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; views: number; engagementRate: number;
  };
};

type Props = {
  posts: PostAnalytics[];
  accounts: { id: string; platform: string; username: string }[];
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube,
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea', instagram: '#E1306C', youtube: '#FF0000',
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return String(n);
}

type SortField = 'views' | 'likes' | 'comments' | 'engagement' | 'date';

export default function LateContentTable({ posts, accounts }: Props) {
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('views');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [secondarySort, setSecondarySort] = useState<SortField | ''>('');
  const [page, setPage] = useState(1);
  const perPage = 20;

  const getSortValue = (post: PostAnalytics, field: SortField): number => {
    switch (field) {
      case 'views': return post.analytics?.views || 0;
      case 'likes': return post.analytics?.likes || 0;
      case 'comments': return post.analytics?.comments || 0;
      case 'engagement': {
        const a = post.analytics;
        return a?.views > 0 ? ((a.likes + a.comments + (a.shares || 0)) / a.views * 100) : 0;
      }
      case 'date': return new Date(post.publishedAt).getTime();
      default: return 0;
    }
  };

  const filtered = useMemo(() => {
    let result = posts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => (p.content || '').toLowerCase().includes(q));
    }
    if (platformFilter) {
      result = result.filter(p => (p.platforms || []).some(pl => pl.platform === platformFilter));
    }
    if (accountFilter) {
      result = result.filter(p => (p.platforms || []).some(pl => pl.accountUsername === accountFilter));
    }
    result = [...result].sort((a, b) => {
      const av = getSortValue(a, sortField);
      const bv = getSortValue(b, sortField);
      let diff = sortDir === 'asc' ? av - bv : bv - av;
      if (diff === 0 && secondarySort) {
        const av2 = getSortValue(a, secondarySort);
        const bv2 = getSortValue(b, secondarySort);
        diff = sortDir === 'asc' ? av2 - bv2 : bv2 - av2;
      }
      return diff;
    });
    return result;
  }, [posts, search, platformFilter, accountFilter, sortField, sortDir, secondarySort]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const selectClass = "appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 pr-7 text-sm text-[var(--text-primary)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors bg-[length:14px] bg-[right_6px_center] bg-no-repeat";
  const chevronStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by title, caption..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] w-60"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className={selectClass} style={chevronStyle} value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(1); }}>
            <option value="">All Platforms</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
          <select className={selectClass} style={chevronStyle} value={accountFilter} onChange={e => { setAccountFilter(e.target.value); setPage(1); }}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.username}>@{a.username}</option>)}
          </select>
          <select className={selectClass} style={chevronStyle} value={sortField} onChange={e => { setSortField(e.target.value as SortField); setPage(1); }}>
            <option value="views">Views</option>
            <option value="likes">Likes</option>
            <option value="comments">Comments</option>
            <option value="engagement">Engagement</option>
            <option value="date">Date</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm hover:border-[var(--primary)] transition-colors"
          >
            {sortDir === 'desc' ? 'Desc \u2191' : 'Asc \u2193'}
          </button>
          <span className="text-xs text-[var(--text-muted)]">then</span>
          <select className={selectClass} style={chevronStyle} value={secondarySort} onChange={e => { setSecondarySort(e.target.value as SortField | ''); setPage(1); }}>
            <option value="">None</option>
            <option value="views">Views</option>
            <option value="likes">Likes</option>
            <option value="comments">Comments</option>
            <option value="engagement">Engagement</option>
            <option value="date">Date</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-medium">Video</th>
              <th className="text-left py-3 px-4 font-medium">Account</th>
              <th className="text-right py-3 px-4 font-medium">Views</th>
              <th className="text-right py-3 px-4 font-medium">Likes</th>
              <th className="text-right py-3 px-4 font-medium">Comments</th>
              <th className="text-right py-3 px-4 font-medium">Eng.</th>
              <th className="text-right py-3 px-4 font-medium">Published</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(post => {
              const mainPlatform = post.platforms?.[0];
              const platform = mainPlatform?.platform || '';
              const Icon = PLATFORM_ICONS[platform];
              const color = PLATFORM_COLORS[platform] || '#888';
              const a = post.analytics || {} as any;
              const er = a.views > 0 ? ((a.likes + a.comments + (a.shares || 0)) / a.views * 100) : 0;

              return (
                <tr
                  key={post.postId}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                  onClick={() => post.platformPostUrl && window.open(post.platformPostUrl, '_blank')}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3 max-w-xs">
                      <div className="w-12 h-12 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0 overflow-hidden">
                        {post.thumbnailUrl ? (
                          <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">video</span>
                        )}
                      </div>
                      <span className="text-sm text-[var(--text-primary)] truncate">{post.content?.slice(0, 40) || 'Untitled'}...</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="text-[var(--text-muted)] text-xs">@{mainPlatform?.accountUsername || '—'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-[var(--text-primary)]">{formatNum(a.views || 0)}</td>
                  <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNum(a.likes || 0)}</td>
                  <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNum(a.comments || 0)}</td>
                  <td className="py-3 px-4 text-right text-[var(--text-primary)]">{er.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-[var(--text-muted)] whitespace-nowrap">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">No posts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span>Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i + 1;
              else if (page <= 4) pageNum = i + 1;
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
              else pageNum = page - 3 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded text-xs ${page === pageNum ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]'}`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
