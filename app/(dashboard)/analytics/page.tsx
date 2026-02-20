'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { HardDriveDownload, RefreshCw, Plus, BarChart3, Link2, Filter, ArrowDownUp, Clock, Search } from 'lucide-react';
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
import type { AnalyticsSnapshot } from '@/types';

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
  const [sortBy, setSortBy] = useState('views');
  const [dateRange, setDateRange] = useState(30);
  const [acctPlatform, setAcctPlatform] = useState('all');
  const [acctSort, setAcctSort] = useState('followers-desc');
  const [activeTab, setActiveTab] = useState('overview');
  const [acctSearch, setAcctSearch] = useState('');
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
    switch (sortBy) {
      case 'views': sorted.sort((a, b) => b.views - a.views); break;
      case 'likes': sorted.sort((a, b) => b.likes - a.likes); break;
      case 'comments': sorted.sort((a, b) => b.comments - a.comments); break;
      case 'date': sorted.sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
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
    const asc = dir === 'asc' ? 1 : -1;
    switch (field) {
      case 'followers': sorted.sort((a, b) => (b.followers - a.followers) * asc); break;
      case 'views': sorted.sort((a, b) => (b.totalViews - a.totalViews) * asc); break;
      case 'engagement': sorted.sort((a, b) => (b.engagementRate - a.engagementRate) * asc); break;
      case 'name': sorted.sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username) * asc); break;
    }
    return sorted;
  }, [accounts, acctPlatform, acctSort, acctSearch]);

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
              {new Date(overview.lastSyncedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
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
                    value={acctSort}
                    onChange={e => setAcctSort(e.target.value)}
                    className="h-7 appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] pl-6 pr-6 text-[11px] font-medium text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]"
                  >
                    <optgroup label="Descending">
                      <option value="followers-desc">Followers ↓</option>
                      <option value="views-desc">Views ↓</option>
                      <option value="engagement-desc">Engagement ↓</option>
                      <option value="name-desc">Name Z→A</option>
                    </optgroup>
                    <optgroup label="Ascending">
                      <option value="followers-asc">Followers ↑</option>
                      <option value="views-asc">Views ↑</option>
                      <option value="engagement-asc">Engagement ↑</option>
                      <option value="name-asc">Name A→Z</option>
                    </optgroup>
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
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={acctSearch}
                onChange={e => setAcctSearch(e.target.value)}
                placeholder="Search accounts..."
                className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--primary)]"
              />
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredAccounts.map(account => (
                  <AccountCard key={account.id} account={account} syncing={syncing} onRefresh={handleRefresh} onRemove={handleRemove} />
                ))}
                {filteredAccounts.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-[var(--text-muted)]">
                    No accounts match this filter.
                  </p>
                )}
              </div>
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
