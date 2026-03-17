'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
import { Search, ChevronDown, Check } from 'lucide-react';

type Account = { id: string; platform: string; username: string; displayName?: string };
type PostAnalytics = {
  postId: string;
  publishedAt: string;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: { views: number; likes: number; comments: number; shares: number };
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea', instagram: '#E1306C', youtube: '#FF0000',
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  tiktok: FaTiktok, instagram: FaInstagram, youtube: FaYoutube,
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

type DayEntry = { date: string; views: number; likes: number; comments: number; shares: number; posts: number };

type Props = {
  accounts: Account[];
  posts: PostAnalytics[];
  dateRange?: { fromDate: string; toDate: string };
};

function SearchableModelSelect({ value, accounts, onChange }: { value: string; accounts: Account[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) { setSearch(''); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.trim().toLowerCase();
    return accounts.filter(a =>
      a.username.toLowerCase().includes(q) ||
      (a.displayName || '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const label = value
    ? (accounts.find(a => a.username === value)?.displayName || value)
    : 'Select account...';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors min-w-[180px]"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[100] w-64 rounded-xl border border-[var(--border)] bg-white dark:bg-[#1a1a1a] shadow-xl backdrop-blur-none">
          <div className="p-2 border-b border-[var(--border)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search accounts..."
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md bg-[var(--muted)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No results</div>
            )}
            {filtered.map(a => (
              <button
                key={a.username}
                type="button"
                onClick={() => { onChange(a.username); setOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--muted)] transition-colors ${
                  a.username === value ? 'text-[var(--primary)] font-medium' : 'text-[var(--text-primary)]'
                }`}
              >
                {a.username === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span className={a.username === value ? '' : 'pl-5'}>{a.displayName || a.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LateAccountViewsChart({ accounts, posts, dateRange }: Props) {
  const [selectedUsername, setSelectedUsername] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [metric, setMetric] = useState<'views' | 'likes' | 'posts'>('views');

  // Build unique display accounts by username
  const uniqueAccounts = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of accounts) {
      if (a.username && !map.has(a.username.toLowerCase())) {
        map.set(a.username.toLowerCase(), a);
      }
    }
    return Array.from(map.values());
  }, [accounts]);

  // Build a set of ALL accountIds for the selected username
  const selectedAccountIds = useMemo(() => {
    if (!selectedUsername) return new Set<string>();
    const uname = selectedUsername.toLowerCase();
    const ids = new Set<string>();
    for (const a of accounts) {
      if (a.username.toLowerCase() === uname && (!platformFilter || a.platform === platformFilter)) {
        ids.add(a.id);
      }
    }
    return ids;
  }, [accounts, selectedUsername, platformFilter]);

  // Platforms available for selected account
  const availablePlatforms = useMemo(() => {
    if (!selectedUsername) return [];
    const uname = selectedUsername.toLowerCase();
    const platforms = new Set<string>();
    for (const a of accounts) {
      if (a.username.toLowerCase() === uname) platforms.add(a.platform);
    }
    return Array.from(platforms);
  }, [accounts, selectedUsername]);

  // Auto-select first account
  useEffect(() => {
    if (uniqueAccounts.length === 0) {
      if (selectedUsername) setSelectedUsername('');
      return;
    }

    const hasSelectedAccount = uniqueAccounts.some(
      account => account.username.toLowerCase() === selectedUsername.toLowerCase()
    );

    if (!selectedUsername || !hasSelectedAccount) {
      setSelectedUsername(uniqueAccounts[0].username);
    }
  }, [uniqueAccounts, selectedUsername]);

  const selectedAccount = uniqueAccounts.find(a => a.username.toLowerCase() === selectedUsername?.toLowerCase());

  // Match posts and aggregate daily
  const { chartData, totalViews, totalLikes, totalPosts } = useMemo(() => {
    if (!selectedUsername) return { chartData: [], totalViews: 0, totalLikes: 0, totalPosts: 0 };
    const uname = selectedUsername.toLowerCase();

    const dayMap = new Map<string, { views: number; likes: number; comments: number; shares: number; posts: number }>();
    const seenPostIds = new Set<string>();

    for (const post of posts) {
      if (seenPostIds.has(post.postId)) continue;

      let matched = false;
      for (const p of (post.platforms || [])) {
        const matchById = selectedAccountIds.has(p.accountId);
        const matchByName = (p.accountUsername || (p as any).username || '').toLowerCase() === uname;
        const platformOk = !platformFilter || p.platform === platformFilter;
        if ((matchById || matchByName) && platformOk) { matched = true; break; }
      }
      if (!matched) continue;
      seenPostIds.add(post.postId);

      const dateStr = post.publishedAt ? post.publishedAt.split('T')[0] : null;
      if (!dateStr) continue;

      if (!dayMap.has(dateStr)) dayMap.set(dateStr, { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 });
      const day = dayMap.get(dateStr)!;
      const a = post.analytics || {};
      day.views += (a as any).views || 0;
      day.likes += (a as any).likes || 0;
      day.comments += (a as any).comments || 0;
      day.shares += (a as any).shares || 0;
      day.posts += 1;
    }

    // Fill all dates in range
    const from = dateRange?.fromDate || (dayMap.size > 0 ? Array.from(dayMap.keys()).sort()[0] : null);
    const to = dateRange?.toDate || new Date().toISOString().split('T')[0];
    if (!from) return { chartData: [], totalViews: 0, totalLikes: 0, totalPosts: 0 };

    const result: DayEntry[] = [];
    const cursor = new Date(from + 'T00:00:00');
    const endDate = new Date(to + 'T00:00:00');
    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().split('T')[0];
      const e = dayMap.get(dateStr);
      result.push({ date: dateStr, views: e?.views || 0, likes: e?.likes || 0, comments: e?.comments || 0, shares: e?.shares || 0, posts: e?.posts || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    let tv = 0, tl = 0, tp = 0;
    for (const d of result) { tv += d.views; tl += d.likes; tp += d.posts; }
    return { chartData: result, totalViews: tv, totalLikes: tl, totalPosts: tp };
  }, [posts, selectedUsername, selectedAccountIds, platformFilter, dateRange]);

  const barColor = PLATFORM_COLORS[platformFilter || selectedAccount?.platform || ''] || '#3b82f6';
  const Icon = PLATFORM_ICONS[platformFilter || selectedAccount?.platform || ''];

  const selectClass = "appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 pr-7 text-sm text-[var(--text-primary)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors bg-[length:14px] bg-[right_6px_center] bg-no-repeat";
  const chevronStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Per Account</h3>
          {selectedAccount && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{formatNum(totalViews)} views</span>
              <span>·</span>
              <span>{formatNum(totalLikes)} likes</span>
              <span>·</span>
              <span>{totalPosts} posts</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchableModelSelect
            value={selectedUsername}
            accounts={uniqueAccounts}
            onChange={v => { setSelectedUsername(v); setPlatformFilter(''); }}
          />
          <select className={selectClass} style={chevronStyle} value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
            <option value="">All Platforms</option>
            {availablePlatforms.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <select className={selectClass} style={chevronStyle} value={metric} onChange={e => setMetric(e.target.value as any)}>
            <option value="views">Views</option>
            <option value="likes">Likes</option>
            <option value="posts">Posts Published</option>
          </select>
        </div>
      </div>

      {chartData.length > 0 && totalPosts > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => formatNum(v)} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              formatter={(_: any, __: any, props: any) => {
                const d = props.payload;
                return [];
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as DayEntry;
                return (
                  <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1f2937', zIndex: 100 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>
                      {new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    {d.posts > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ color: '#6b7280' }}>{d.posts} post{d.posts > 1 ? 's' : ''}</div>
                        <div style={{ color: barColor, fontWeight: 600 }}>{formatNum(d.views)} views</div>
                        <div>{formatNum(d.likes)} likes · {formatNum(d.comments)} comments</div>
                      </div>
                    ) : (
                      <div style={{ color: '#9ca3af' }}>No posts</div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey={metric} radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry[metric] > 0 ? barColor : 'transparent'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-[var(--text-muted)]">
          {selectedUsername ? 'No posts for this account in the selected period' : 'Select an account to view metrics'}
        </div>
      )}

      {totalPosts > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Shows total {metric === 'posts' ? 'posts published' : metric} of content published on each day. Data reflects lifetime metrics per post.
        </p>
      )}
    </div>
  );
}
