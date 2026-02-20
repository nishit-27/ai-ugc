'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { RefreshCw, Plus, BarChart3, Link2, Filter, ArrowDownUp, Clock, Search, LayoutGrid, List, ExternalLink } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useToast } from '@/hooks/useToast';
import OverviewCards from '@/components/analytics/OverviewCards';
import FollowersChart from '@/components/analytics/FollowersChart';
import DailyFollowersChart from '@/components/analytics/DailyFollowersChart';
import PlatformComparison from '@/components/analytics/PlatformComparison';
import PostingActivity from '@/components/analytics/PostingActivity';
import TopVideosTable from '@/components/analytics/TopVideosTable';
import ContentHighlights from '@/components/analytics/ContentHighlights';
import AccountCard from '@/components/analytics/AccountCard';
import AddAccountModal from '@/components/analytics/AddAccountModal';
import MediaTable from '@/components/analytics/MediaTable';
import ViewsDistribution from '@/components/analytics/ViewsDistribution';
import TrendsCharts from '@/components/analytics/TrendsCharts';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import type { AnalyticsSnapshot } from '@/types';

const ACCT_PER_PAGE = 12;

const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; urlPrefix: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3.5 w-3.5" />,    color: '#00f2ea', bg: 'bg-[#00f2ea]/10', urlPrefix: 'https://www.tiktok.com/@' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3.5 w-3.5" />, color: '#E1306C', bg: 'bg-[#E1306C]/10', urlPrefix: 'https://www.instagram.com/' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3.5 w-3.5" />,   color: '#FF0000', bg: 'bg-[#FF0000]/10', urlPrefix: 'https://www.youtube.com/@' },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

const DATE_RANGES = [
  { label: 'Today', days: 1 },
  { label: 'Week', days: 7 },
  { label: 'Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: 'All', days: 0 },
];

function filterHistory(history: AnalyticsSnapshot[], days: number): AnalyticsSnapshot[] {
  if (days === 0 || history.length === 0) return history;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return history.filter(s => new Date(s.date) >= cutoff);
}

function AnalyticsContent() {
  const { showToast } = useToast();
  const {
    overview,
    accounts,
    mediaItems,
    loading,
    syncing,
    addAccount,
    removeAccount,
    refreshAccount,
    hardSync,
    reload,
  } = useAnalytics();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [sortBy, setSortBy] = useState('views-desc');
  const [dateRange, setDateRange] = useState(30);
  const [acctPlatform, setAcctPlatform] = useState('all');
  const [acctSort, setAcctSort] = useState('followers-desc');
  const [activeTab, setActiveTab] = useState('overview');
  const [acctSearch, setAcctSearch] = useState('');
  const [acctView, setAcctView] = useState<'grid' | 'list'>('list');
  const [acctPage, setAcctPage] = useState(1);
  const [contentSearch, setContentSearch] = useState('');
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSyncAttempted = useRef(false);
  const syncingRef = useRef(false);

  const syncFromConnections = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setAutoSyncing(true);
    try {
      // Step 1: Import accounts from connections
      const res = await fetch('/api/analytics/auto-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-sync failed');

      if (data.added?.length > 0) {
        showToast(`Imported ${data.added.length} account(s). Fetching metrics...`, 'success');
        // Step 2: Hard sync all accounts
        try {
          await hardSync(true);
          showToast('All accounts synced successfully', 'success');
        } catch {
          showToast('Some accounts may not have synced. Try Hard Sync.', 'error');
        }
      } else {
        showToast('No new accounts to import', 'info');
      }
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Auto-sync failed', 'error');
    } finally {
      setAutoSyncing(false);
      syncingRef.current = false;
    }
  }, [showToast, reload, hardSync]);

  const handleHardSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      showToast('Hard syncing all accounts...', 'info');
      const result = await hardSync(true);
      if (result?.skipped) {
        showToast('Already synced today. Showing cached data.', 'info');
      } else {
        showToast('All accounts synced', 'success');
      }
    } catch {
      showToast('Some accounts failed to sync', 'error');
    } finally {
      syncingRef.current = false;
    }
  }, [hardSync, showToast]);

  useEffect(() => {
    if (!loading && accounts.length === 0 && !autoSyncAttempted.current) {
      autoSyncAttempted.current = true;
      syncFromConnections();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, accounts.length]);

  const filteredMedia = useMemo(() => {
    let items = mediaItems;
    if (platformFilter !== 'all') items = items.filter(i => i.platform === platformFilter);
    if (accountFilter !== 'all') items = items.filter(i => i.accountId === accountFilter);
    if (contentSearch.trim()) {
      const q = contentSearch.trim().toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.caption || '').toLowerCase().includes(q) ||
        i.platform.toLowerCase().includes(q) ||
        (i.externalId || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...items];
    const [sortField, sortDir] = sortBy.split('-') as [string, string];
    const mul = sortDir === 'desc' ? 1 : -1;
    switch (sortField) {
      case 'views': sorted.sort((a, b) => (b.views - a.views) * mul); break;
      case 'likes': sorted.sort((a, b) => (b.likes - a.likes) * mul); break;
      case 'comments': sorted.sort((a, b) => (b.comments - a.comments) * mul); break;
      case 'date': sorted.sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return (db - da) * mul;
      }); break;
    }
    return sorted;
  }, [mediaItems, platformFilter, accountFilter, sortBy, contentSearch]);

  const filteredHistory = useMemo(
    () => filterHistory(overview?.history || [], dateRange),
    [overview?.history, dateRange],
  );

  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (acctPlatform !== 'all') list = list.filter(a => a.platform === acctPlatform);
    if (acctSearch.trim()) {
      const q = acctSearch.trim().toLowerCase();
      list = list.filter(a =>
        (a.displayName || '').toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    const [field, dir] = acctSort.split('-') as [string, string];
    const mul = dir === 'desc' ? 1 : -1;
    switch (field) {
      case 'followers': sorted.sort((a, b) => (b.followers - a.followers) * mul); break;
      case 'views': sorted.sort((a, b) => (b.totalViews - a.totalViews) * mul); break;
      case 'engagement': sorted.sort((a, b) => (b.engagementRate - a.engagementRate) * mul); break;
      case 'name': sorted.sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username) * mul); break;
    }
    return sorted;
  }, [accounts, acctPlatform, acctSort, acctSearch]);

  // Reset page when filters change
  useEffect(() => { setAcctPage(1); }, [acctPlatform, acctSort, acctSearch]);

  const acctTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCT_PER_PAGE));
  const paginatedAccounts = filteredAccounts.slice((acctPage - 1) * ACCT_PER_PAGE, acctPage * ACCT_PER_PAGE);

  const handleAddAccount = async (platform: string, username: string) => {
    try {
      await addAccount(platform, username);
      showToast(`Added @${username} for analytics`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add account', 'error');
      throw err;
    }
  };

  const handleRemove = async (id: string) => {
    await removeAccount(id);
    showToast('Account removed from analytics', 'success');
  };

  const handleRefresh = async (id: string) => {
    await refreshAccount(id);
    showToast('Account refreshed', 'success');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
          <h1 className="text-xl font-bold">Analytics</h1>
          {overview?.lastSyncedAt && (
            <span className="flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
              <Clock className="h-3 w-3 shrink-0" />
              Last updated {new Date(overview.lastSyncedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={syncFromConnections} disabled={autoSyncing || syncing}>
            <Link2 className={`mr-1.5 h-3.5 w-3.5 ${autoSyncing ? 'animate-spin' : ''}`} />
            {autoSyncing ? 'Importing...' : 'Sync from Connections'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleHardSync} disabled={syncing || autoSyncing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Hard Sync'}
          </Button>
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {/* Account filters — only visible on Accounts tab */}
            {activeTab === 'accounts' && accounts.length > 0 && (
              <>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                  <select
                    value={acctPlatform}
                    onChange={e => setAcctPlatform(e.target.value)}
                    className="h-7 appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] pl-6 pr-6 text-[11px] font-medium text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]"
                  >
                    <option value="all">All Platforms</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
                <div className="relative">
                  <ArrowDownUp className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                  <select
                    value={acctSort.split('-')[0]}
                    onChange={e => {
                      const dir = acctSort.split('-')[1] || 'desc';
                      setAcctSort(`${e.target.value}-${dir}`);
                    }}
                    className="h-7 appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] pl-6 pr-6 text-[11px] font-medium text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]"
                  >
                    <option value="followers">Followers</option>
                    <option value="views">Views</option>
                    <option value="engagement">Engagement</option>
                    <option value="name">Name</option>
                  </select>
                </div>
                <div className="relative">
                  <select
                    value={acctSort.split('-')[1] || 'desc'}
                    onChange={e => {
                      const field = acctSort.split('-')[0];
                      setAcctSort(`${field}-${e.target.value}`);
                    }}
                    className="h-7 appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] pl-6 pr-6 text-[11px] font-medium text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]"
                  >
                    <option value="desc">Desc ↑</option>
                    <option value="asc">Asc ↓</option>
                  </select>
                </div>
              </>
            )}
            {/* Date range filter */}
            {/* <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              {DATE_RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={() => setDateRange(r.days)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    dateRange === r.days
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div> */}
          </div>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="mt-5 space-y-6">
          {/* All 8 stats in a single row */}
          <div className="grid grid-cols-4 gap-3 xl:grid-cols-8">
            <OverviewCards overview={overview} history={filteredHistory} />
            <ContentHighlights overview={overview} items={mediaItems} />
          </div>

          {/* Charts row: Audience Growth + Daily Subscribers */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <FollowersChart />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <DailyFollowersChart />
            </div>
          </div>

          {/* Platform + Posting Activity */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <PlatformComparison overview={overview} />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <PostingActivity />
            </div>
          </div>

          {/* Top Videos */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <TopVideosTable items={mediaItems} />
          </div>
        </TabsContent>

        {/* Tab 2: Accounts */}
        <TabsContent value="accounts" className="mt-4 space-y-4">
          {accounts.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={acctSearch}
                  onChange={e => setAcctSearch(e.target.value)}
                  placeholder="Search accounts..."
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--primary)]"
                />
              </div>
              <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                <button
                  onClick={() => setAcctView('grid')}
                  className={`rounded-md p-1.5 transition-colors ${acctView === 'grid' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setAcctView('list')}
                  className={`rounded-md p-1.5 transition-colors ${acctView === 'list' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}
                  title="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <BarChart3 className="h-12 w-12 text-[var(--text-muted)]" />
              <div>
                <p className="text-lg font-semibold">No accounts tracked yet</p>
                <p className="text-sm text-[var(--text-muted)]">Add a social media account to start tracking analytics.</p>
              </div>
              <Button onClick={() => setAddModalOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Your First Account
              </Button>
            </div>
          ) : (
            <>
              {acctView === 'grid' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedAccounts.map(account => (
                    <AccountCard key={account.id} account={account} syncing={syncing} onRefresh={handleRefresh} onRemove={handleRemove} />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Account</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Platform</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Followers</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Videos</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Engagement</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAccounts.map(account => {
                        const meta = PLATFORM_META[account.platform] || { label: account.platform, icon: null, color: '#9ca3af', bg: 'bg-gray-500/10', urlPrefix: '' };
                        const profileLink = meta.urlPrefix ? `${meta.urlPrefix}${account.username}` : '';
                        return (
                          <tr key={account.id} className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--muted)]/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {account.profileUrl ? (
                                  <img
                                    src={account.profileUrl}
                                    alt=""
                                    className="h-8 w-8 rounded-full object-cover"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.style.display = 'none';
                                      target.nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                <div className={`${account.profileUrl ? 'hidden' : ''} flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg}`} style={{ color: meta.color }}>
                                  {meta.icon || account.username[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{account.displayName || account.username}</p>
                                  <p className="truncate text-xs text-[var(--text-muted)]">@{account.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg}`} style={{ color: meta.color }}>
                                {meta.icon}
                                {meta.label}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{formatNumber(account.followers)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatNumber(account.totalViews)}</td>
                            <td className="px-4 py-3 text-right font-medium">{account.mediaCount ?? 0}</td>
                            <td className="px-4 py-3 text-right font-medium">{account.engagementRate.toFixed(1)}%</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {profileLink && (
                                  <a href={profileLink} target="_blank" rel="noopener noreferrer" title={`Visit on ${meta.label}`}>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                      <span><ExternalLink className="h-3 w-3" /></span>
                                    </Button>
                                  </a>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleRefresh(account.id)} disabled={syncing} className="h-7 w-7 p-0" title="Refresh">
                                  <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredAccounts.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No accounts match this filter.
                </p>
              )}

              {/* Pagination */}
              {acctTotalPages > 1 && (
                <Pagination className="pt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); setAcctPage(p => Math.max(1, p - 1)); }}
                        className={acctPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {getPageNumbers(acctPage, acctTotalPages).map((p, i) =>
                      p === '...' ? (
                        <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={acctPage === p}
                            onClick={(e) => { e.preventDefault(); setAcctPage(p as number); }}
                            className="cursor-pointer"
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); setAcctPage(p => Math.min(acctTotalPages, p + 1)); }}
                        className={acctPage === acctTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 3: Content */}
        <TabsContent value="content" className="mt-4 space-y-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={contentSearch}
              onChange={e => setContentSearch(e.target.value)}
              placeholder="Search by title, caption..."
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--primary)]"
            />
          </div>
          <MediaTable
            items={filteredMedia}
            accounts={accounts}
            platformFilter={platformFilter}
            accountFilter={accountFilter}
            sortBy={sortBy}
            onPlatformChange={setPlatformFilter}
            onAccountChange={setAccountFilter}
            onSortChange={setSortBy}
          />
          <ViewsDistribution items={filteredMedia} />
        </TabsContent>

        {/* Tab 4: Trends */}
        <TabsContent value="trends" className="mt-4">
          <TrendsCharts overview={overview} />
        </TabsContent>
      </Tabs>

      <AddAccountModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onAdd={handleAddAccount} />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
