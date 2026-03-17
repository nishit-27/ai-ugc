'use client';

import { useState, useMemo } from 'react';
import { Search, ExternalLink, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
import { getRunableIntegrationValueByName } from '@/lib/runable-integration';

type FollowerStat = {
  accountId: string;
  platform: string;
  username: string;
  displayName?: string;
  followerCount: number;
  followerGrowth: number;
  growthRate: number;
  dataPoints: number;
};

type PostAnalytics = {
  postId: string;
  variableValues?: Record<string, string>;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: { views: number; likes: number; comments: number; shares: number; impressions: number; engagementRate: number };
};

type Props = {
  followerStats: FollowerStat[];
  posts: PostAnalytics[];
  onSelectAccount?: (accountId: string, platform: string) => void;
};

const PLATFORM_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; urlPrefix: string }> = {
  tiktok: { label: 'TikTok', icon: FaTiktok, color: '#00f2ea', urlPrefix: 'https://www.tiktok.com/@' },
  instagram: { label: 'Instagram', icon: FaInstagram, color: '#E1306C', urlPrefix: 'https://www.instagram.com/' },
  youtube: { label: 'YouTube', icon: FaYoutube, color: '#FF0000', urlPrefix: 'https://www.youtube.com/@' },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return String(n);
}

type SortField = 'followers' | 'views' | 'videos' | 'engagement' | 'name';

export default function LateAccountsTable({ followerStats, posts, onSelectAccount }: Props) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [platformFilter, setPlatformFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('followers');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Compute per-account metrics from posts
  const accountMetrics = useMemo(() => {
    const map = new Map<string, { views: number; likes: number; comments: number; shares: number; videoCount: number; runableVideoCount: number }>();
    for (const post of posts) {
      const hasRunableIntegration = getRunableIntegrationValueByName(post.variableValues);
      for (const p of (post.platforms || [])) {
        if (!p.accountId) continue;
        if (!map.has(p.accountId)) map.set(p.accountId, { views: 0, likes: 0, comments: 0, shares: 0, videoCount: 0, runableVideoCount: 0 });
        const m = map.get(p.accountId)!;
        const a = p.analytics || post.analytics || {};
        m.views += (a as any).views || 0;
        m.likes += (a as any).likes || 0;
        m.comments += (a as any).comments || 0;
        m.shares += (a as any).shares || 0;
        m.videoCount += 1;
        if (hasRunableIntegration) m.runableVideoCount += 1;
      }
    }
    return map;
  }, [posts]);

  // Merge followerStats with computed metrics
  const accounts = useMemo(() => {
    return followerStats.map(fs => {
      const metrics = accountMetrics.get(fs.accountId) || { views: 0, likes: 0, comments: 0, shares: 0, videoCount: 0, runableVideoCount: 0 };
      const totalInteractions = metrics.likes + metrics.comments + metrics.shares;
      const engagementRate = metrics.views > 0 ? (totalInteractions / metrics.views) * 100 : 0;
      return {
        ...fs,
        views: metrics.views,
        videoCount: metrics.videoCount,
        runableVideoCount: metrics.runableVideoCount,
        engagementRate,
      };
    });
  }, [followerStats, accountMetrics]);

  // Filter & sort
  const filtered = useMemo(() => {
    let result = accounts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => (a.displayName || '').toLowerCase().includes(q) || a.username.toLowerCase().includes(q) || a.platform.toLowerCase().includes(q));
    }
    if (platformFilter) {
      result = result.filter(a => a.platform === platformFilter);
    }
    result.sort((a, b) => {
      let av: number | string, bv: number | string;
      switch (sortField) {
        case 'followers': av = a.followerCount; bv = b.followerCount; break;
        case 'views': av = a.views; bv = b.views; break;
        case 'videos': av = a.videoCount; bv = b.videoCount; break;
        case 'engagement': av = a.engagementRate; bv = b.engagementRate; break;
        case 'name': av = (a.displayName || a.username).toLowerCase(); bv = (b.displayName || b.username).toLowerCase(); break;
        default: av = a.followerCount; bv = b.followerCount;
      }
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return result;
  }, [accounts, search, platformFilter, sortField, sortDir]);

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
            placeholder="Search accounts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] w-60"
          />
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button onClick={() => setView('grid')} className={`p-1.5 ${view === 'grid' ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-secondary)]'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-secondary)]'}`}><List className="h-4 w-4" /></button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className={selectClass} style={chevronStyle} value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
            <option value="">All Platforms</option>
            {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className={selectClass} style={chevronStyle} value={sortField} onChange={e => setSortField(e.target.value as SortField)}>
            <option value="followers">Followers</option>
            <option value="views">Views</option>
            <option value="videos">Videos</option>
            <option value="engagement">Engagement</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm hover:border-[var(--primary)] transition-colors"
          >
            {sortDir === 'desc' ? 'Desc \u2191' : 'Asc \u2193'}
          </button>
        </div>
      </div>

      {/* List view */}
      {view === 'list' ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4 font-medium">Account</th>
                <th className="text-left py-3 px-4 font-medium">Platform</th>
                <th className="text-right py-3 px-4 font-medium">Followers</th>
                <th className="text-right py-3 px-4 font-medium">Views</th>
                <th className="text-right py-3 px-4 font-medium">Videos</th>
                <th className="text-right py-3 px-4 font-medium">Engagement</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(account => {
                const meta = PLATFORM_META[account.platform];
                const Icon = meta?.icon;
                return (
                  <tr
                    key={account.accountId}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    onClick={() => onSelectAccount?.(account.accountId, account.platform)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: meta?.color || '#888' }}>
                          {(account.displayName || account.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">{account.displayName || account.username}</div>
                          <div className="text-xs text-[var(--text-muted)]">@{account.username}</div>
                          {account.runableVideoCount > 0 && (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                Runnable {account.runableVideoCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${meta?.color || '#888'}15`, color: meta?.color || '#888' }}>
                        {Icon && <Icon className="h-3 w-3" />}
                        {meta?.label || account.platform}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[var(--text-primary)]">{formatNum(account.followerCount)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNum(account.views)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{account.videoCount}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{account.engagementRate.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        {meta?.urlPrefix && (
                          <a href={`${meta.urlPrefix}${account.username}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">No accounts found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid view */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(account => {
            const meta = PLATFORM_META[account.platform];
            const Icon = meta?.icon;
            return (
              <div
                key={account.accountId}
                onClick={() => onSelectAccount?.(account.accountId, account.platform)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 hover:border-[var(--primary)] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: meta?.color || '#888' }}>
                      {(account.displayName || account.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-[var(--text-primary)]">{account.displayName || account.username}</div>
                      <div className="text-xs text-[var(--text-muted)]">@{account.username}</div>
                      {account.runableVideoCount > 0 && (
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Runnable {account.runableVideoCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${meta?.color || '#888'}15`, color: meta?.color || '#888' }}>
                    {Icon && <Icon className="h-3 w-3" />}
                    {meta?.label || account.platform}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Followers</div>
                    <div className="font-semibold text-[var(--text-primary)]">{formatNum(account.followerCount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Views</div>
                    <div className="font-semibold text-[var(--text-primary)]">{formatNum(account.views)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Videos</div>
                    <div className="font-semibold text-[var(--text-primary)]">{account.videoCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Engagement</div>
                    <div className="font-semibold text-[var(--text-primary)]">{account.engagementRate.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-[var(--text-muted)]">No accounts found</div>
          )}
        </div>
      )}
    </div>
  );
}
