'use client';

import { Suspense, useMemo, useCallback } from 'react';
import { useLateAnalytics } from '@/hooks/useLateAnalytics';
import Spinner from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import LateAnalyticsFilters from '@/components/late-analytics/LateAnalyticsFilters';
import LateMetricCards from '@/components/late-analytics/LateMetricCards';
import LateFollowerChart from '@/components/late-analytics/LateFollowerChart';
import LateDailyChart from '@/components/late-analytics/LateDailyChart';
import LatePlatformBreakdown from '@/components/late-analytics/LatePlatformBreakdown';
import LateBestTimeHeatmap from '@/components/late-analytics/LateBestTimeHeatmap';
import LateTopPosts from '@/components/late-analytics/LateTopPosts';
import LatePostingFrequency from '@/components/late-analytics/LatePostingFrequency';
import LateContentDecay from '@/components/late-analytics/LateContentDecay';
import LatePostingActivity from '@/components/late-analytics/LatePostingActivity';
import LateAccountsTable from '@/components/late-analytics/LateAccountsTable';
import LateContentTable from '@/components/late-analytics/LateContentTable';
import LateAccountViewsChart from '@/components/late-analytics/LateAccountViewsChart';
import LateMetricsChart from '@/components/late-analytics/LateMetricsChart';
import {
  RUNABLE_INTEGRATION_VARIABLE_NAME,
  getRunableIntegrationValueByName,
} from '@/lib/runable-integration';
import {
  getDateKeyInTimeZone,
  getTodayDateKey,
  listDateKeysInRange,
  shiftDateKey,
} from '@/lib/dateUtils';

const ANALYTICS_START_DATE = '2020-01-01';

function LateMetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
        >
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

function AnalyticsPanelSkeleton({
  titleWidth = 'w-36',
  metaWidth = 'w-20',
  chartHeight = 'h-64',
  footerLines = 0,
}: {
  titleWidth?: string;
  metaWidth?: string;
  chartHeight?: string;
  footerLines?: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className={`h-4 ${titleWidth}`} />
        <Skeleton className={`h-3 ${metaWidth}`} />
      </div>
      <Skeleton className={`w-full ${chartHeight}`} />
      {footerLines > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: footerLines }, (_, index) => (
            <Skeleton key={index} className={`h-3 ${index % 2 === 0 ? 'w-full' : 'w-4/5'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 border-b border-[var(--border)] pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 w-20" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={`h-4 ${columnIndex === 0 ? 'w-4/5' : columnIndex === columns - 1 ? 'ml-auto w-16' : 'w-2/3'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewTabSkeleton() {
  return (
    <div className="space-y-6 pt-6">
      <AnalyticsPanelSkeleton titleWidth="w-40" metaWidth="w-24" chartHeight="h-[360px]" />
      <AnalyticsPanelSkeleton titleWidth="w-32" metaWidth="w-20" chartHeight="h-[220px]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnalyticsPanelSkeleton titleWidth="w-36" metaWidth="w-16" chartHeight="h-[280px]" />
        <AnalyticsPanelSkeleton titleWidth="w-32" metaWidth="w-24" chartHeight="h-[280px]" />
      </div>
      <AnalyticsPanelSkeleton titleWidth="w-36" metaWidth="w-16" chartHeight="h-[320px]" />
      <AnalyticsPanelSkeleton titleWidth="w-44" metaWidth="w-20" chartHeight="h-[280px]" />
    </div>
  );
}

function EngagementTabSkeleton() {
  return (
    <div className="space-y-6 pt-6">
      <AnalyticsPanelSkeleton titleWidth="w-40" metaWidth="w-24" chartHeight="h-[360px]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnalyticsPanelSkeleton titleWidth="w-32" metaWidth="w-20" chartHeight="h-[280px]" />
        <AnalyticsPanelSkeleton titleWidth="w-40" metaWidth="w-16" chartHeight="h-[280px]" footerLines={2} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnalyticsPanelSkeleton titleWidth="w-44" metaWidth="w-16" chartHeight="h-[260px]" />
        <AnalyticsPanelSkeleton titleWidth="w-36" metaWidth="w-20" chartHeight="h-[260px]" />
      </div>
    </div>
  );
}

type RunnableAnalyticsPost = {
  postId: string;
  publishedAt: string;
  variableValues?: Record<string, string>;
  platforms: { platform: string; accountId: string; accountUsername: string; analytics?: Record<string, number> }[];
  analytics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    views: number;
  };
};

type MetricTotals = {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
  reach: number;
  clicks: number;
  saves: number;
  postCount: number;
};

function createEmptyTotals(): MetricTotals {
  return { likes: 0, comments: 0, shares: 0, views: 0, impressions: 0, reach: 0, clicks: 0, saves: 0, postCount: 0 };
}

function buildTotalsFromPosts(posts: RunnableAnalyticsPost[]): MetricTotals {
  return posts.reduce((acc, post) => {
    const analytics = post.analytics || {} as Record<string, number>;
    acc.likes += analytics.likes || 0;
    acc.comments += analytics.comments || 0;
    acc.shares += analytics.shares || 0;
    acc.views += analytics.views || 0;
    acc.impressions += analytics.impressions || 0;
    acc.reach += analytics.reach || 0;
    acc.clicks += analytics.clicks || 0;
    acc.saves += analytics.saves || 0;
    acc.postCount += 1;
    return acc;
  }, createEmptyTotals());
}

function buildDailyMetricsFromPosts(
  posts: RunnableAnalyticsPost[],
  dateRange: { fromDate: string; toDate: string }
) {
  const dayMap = new Map<string, {
    date: string;
    postCount: number;
    metrics: {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      views: number;
    };
    platforms: Record<string, number>;
  }>();

  for (const date of listDateKeysInRange(dateRange.fromDate, dateRange.toDate)) {
    dayMap.set(date, {
      date,
      postCount: 0,
      metrics: {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
      },
      platforms: {},
    });
  }

  for (const post of posts) {
    if (!post.publishedAt) continue;
    const date = getDateKeyInTimeZone(post.publishedAt);
    const day = dayMap.get(date);
    if (!day) continue;

    const analytics = post.analytics || {} as Record<string, number>;
    day.postCount += 1;
    day.metrics.impressions += analytics.impressions || 0;
    day.metrics.reach += analytics.reach || 0;
    day.metrics.likes += analytics.likes || 0;
    day.metrics.comments += analytics.comments || 0;
    day.metrics.shares += analytics.shares || 0;
    day.metrics.saves += analytics.saves || 0;
    day.metrics.clicks += analytics.clicks || 0;
    day.metrics.views += analytics.views || 0;

    for (const platform of post.platforms || []) {
      if (!platform.platform) continue;
      day.platforms[platform.platform] = (day.platforms[platform.platform] || 0) + 1;
    }
  }

  return Array.from(dayMap.values());
}

function LateAnalyticsContent() {
  const {
    posts,
    dailyMetrics,
    followerStats,
    bestTimes,
    postingFrequency,
    contentDecay,
    accounts,
    loading,
    refreshing,
    filters,
    setFilters,
    lastSync,
    refresh,
  } = useLateAnalytics();

  // Compute date range for child components
  const dateRange = useMemo(() => {
    const today = getTodayDateKey();

    if (filters.dateRange === 'custom') {
      return {
        fromDate: filters.customFrom || ANALYTICS_START_DATE,
        toDate: filters.customTo || today,
      };
    }

    const presetDays = filters.dateRange === '7d'
      ? 7
      : filters.dateRange === '30d'
        ? 30
        : filters.dateRange === '90d'
          ? 90
          : filters.dateRange === '180d'
            ? 180
            : filters.dateRange === '365d'
              ? 365
              : 0;

    return {
      fromDate: presetDays > 0 ? shiftDateKey(today, -(presetDays - 1)) : ANALYTICS_START_DATE,
      toDate: today,
    };
  }, [filters.dateRange, filters.customFrom, filters.customTo]);

  const handleDownload = useCallback(() => {
    if (posts.length === 0) return;
    const headers = ['Post ID', 'Content', 'Published', 'Platform', 'Account', 'Views', 'Likes', 'Comments', 'Shares', 'Impressions', 'Reach', 'Engagement %'];
    const rows = posts.map(post => {
      const p = post.platforms?.[0];
      const a = post.analytics || {};
      const er = a.views > 0 ? ((a.likes + a.comments + (a.shares || 0)) / a.views * 100).toFixed(2) : '0';
      return [
        post.postId,
        `"${(post.content || '').replace(/"/g, '""').slice(0, 200)}"`,
        post.publishedAt || '',
        p?.platform || '',
        p?.accountUsername || '',
        a.views || 0,
        a.likes || 0,
        a.comments || 0,
        a.shares || 0,
        a.impressions || 0,
        a.reach || 0,
        er,
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${getTodayDateKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [posts]);

  const runnablePosts = useMemo(
    () => posts.filter((post) => getRunableIntegrationValueByName(post.variableValues)),
    [posts]
  );

  const runnableAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of runnablePosts) {
      for (const platform of post.platforms || []) {
        if (platform.accountId) ids.add(platform.accountId);
      }
    }
    return ids;
  }, [runnablePosts]);

  const runnableAccounts = useMemo(
    () => accounts.filter((account) => runnableAccountIds.has(account.id)),
    [accounts, runnableAccountIds]
  );

  const runnableFollowerStats = useMemo(
    () => followerStats.filter((account) => runnableAccountIds.has(account.accountId)),
    [followerStats, runnableAccountIds]
  );

  const runnableTotals = useMemo(
    () => buildTotalsFromPosts(runnablePosts),
    [runnablePosts]
  );

  const runnableDailyMetrics = useMemo(
    () => buildDailyMetricsFromPosts(runnablePosts, dateRange),
    [dateRange, runnablePosts]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  // Compute aggregate metrics from daily-metrics
  const totals = dailyMetrics.length > 0
    ? dailyMetrics.reduce(
        (acc, day) => {
          const m = day.metrics || {} as Record<string, number>;
          acc.likes += m.likes || 0;
          acc.comments += m.comments || 0;
          acc.shares += m.shares || 0;
          acc.views += m.views || 0;
          acc.impressions += m.impressions || 0;
          acc.reach += m.reach || 0;
          acc.clicks += m.clicks || 0;
          acc.saves += m.saves || 0;
          acc.postCount += day.postCount || 0;
          return acc;
        },
        { likes: 0, comments: 0, shares: 0, views: 0, impressions: 0, reach: 0, clicks: 0, saves: 0, postCount: 0 }
      )
    : posts.reduce(
        (acc, post) => {
          const a = post.analytics || {} as Record<string, number>;
          acc.likes += a.likes || 0;
          acc.comments += a.comments || 0;
          acc.shares += a.shares || 0;
          acc.views += a.views || 0;
          acc.impressions += a.impressions || 0;
          acc.reach += a.reach || 0;
          acc.clicks += a.clicks || 0;
          acc.saves += a.saves || 0;
          acc.postCount += 1;
          return acc;
        },
        { likes: 0, comments: 0, shares: 0, views: 0, impressions: 0, reach: 0, clicks: 0, saves: 0, postCount: 0 }
      );

  const totalFollowers = followerStats.reduce((sum, s) => sum + (s.followerCount || 0), 0);

  // Build platform breakdown from posts
  const platformTotals: Record<string, { posts: number; likes: number; comments: number; shares: number; views: number; impressions: number; reach: number }> = {};
  for (const post of posts) {
    const platforms = Array.isArray(post.platforms) ? post.platforms : [];
    for (const p of platforms) {
      const platform = p.platform;
      if (!platform) continue;
      if (!platformTotals[platform]) platformTotals[platform] = { posts: 0, likes: 0, comments: 0, shares: 0, views: 0, impressions: 0, reach: 0 };
      const pt = platformTotals[platform];
      pt.posts += 1;
      const a = p.analytics || {};
      pt.likes += a.likes || 0;
      pt.comments += a.comments || 0;
      pt.shares += a.shares || 0;
      pt.views += a.views || 0;
      pt.impressions += a.impressions || 0;
      pt.reach += a.reach || 0;
    }
  }

  return (
    <div className="space-y-6" aria-busy={refreshing}>
      <LateAnalyticsFilters filters={filters} setFilters={setFilters} lastSync={lastSync} onRefresh={refresh} onDownload={handleDownload} accounts={accounts} />

      {refreshing && (
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
          </span>
          <span>Loading fresh analytics for your filters...</span>
        </div>
      )}

      {refreshing ? (
        <LateMetricCardsSkeleton />
      ) : (
        <LateMetricCards totals={totals} totalFollowers={totalFollowers} />
      )}

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-[var(--border)] pb-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="runnable">Runnable</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-6">
          {refreshing ? (
            <OverviewTabSkeleton />
          ) : (
            <>
              <LateMetricsChart dailyMetrics={dailyMetrics} dateRange={dateRange} />
              <LatePostingActivity dailyMetrics={dailyMetrics} dateRange={dateRange} />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <LateFollowerChart followerStats={followerStats} totalFollowers={totalFollowers} />
                <LateAccountViewsChart accounts={accounts} posts={posts} dateRange={dateRange} />
              </div>
              <LateDailyChart dailyMetrics={dailyMetrics} dateRange={dateRange} />
              <LatePlatformBreakdown platforms={platformTotals} totalFollowers={totalFollowers} followerStats={followerStats} />
            </>
          )}
        </TabsContent>

        <TabsContent value="engagement" className="space-y-6 pt-6">
          {refreshing ? (
            <EngagementTabSkeleton />
          ) : (
            <>
              <LateMetricsChart dailyMetrics={dailyMetrics} dateRange={dateRange} />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <LateBestTimeHeatmap bestTimes={bestTimes} />
                <LateTopPosts posts={posts} />
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <LatePostingFrequency data={postingFrequency} />
                <LateContentDecay data={contentDecay} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="accounts" className="pt-6">
          {refreshing ? (
            <AnalyticsTableSkeleton rows={7} columns={6} />
          ) : (
            <LateAccountsTable followerStats={followerStats} posts={posts} />
          )}
        </TabsContent>

        <TabsContent value="content" className="pt-6">
          {refreshing ? (
            <AnalyticsTableSkeleton rows={8} columns={7} />
          ) : (
            <LateContentTable posts={posts} accounts={accounts} />
          )}
        </TabsContent>

        <TabsContent value="runnable" className="space-y-6 pt-6">
          {refreshing ? (
            <>
              <LateMetricCardsSkeleton />
              <AnalyticsPanelSkeleton titleWidth="w-40" metaWidth="w-24" chartHeight="h-[360px]" />
              <AnalyticsPanelSkeleton titleWidth="w-40" metaWidth="w-20" chartHeight="h-[280px]" />
              <AnalyticsTableSkeleton rows={6} columns={6} />
              <AnalyticsTableSkeleton rows={8} columns={7} />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Showing videos tagged <span className="font-semibold">{RUNABLE_INTEGRATION_VARIABLE_NAME} = True</span>.
              </div>
              {runnablePosts.length > 0 ? (
                <>
                  <LateMetricCards totals={runnableTotals} totalFollowers={totalFollowers} />
                  <LateMetricsChart dailyMetrics={runnableDailyMetrics} dateRange={dateRange} />
                  <LateAccountViewsChart accounts={runnableAccounts} posts={runnablePosts} dateRange={dateRange} />
                  <LateAccountsTable followerStats={runnableFollowerStats} posts={runnablePosts} />
                  <LateContentTable posts={runnablePosts} accounts={runnableAccounts} />
                </>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-14 text-center text-sm text-[var(--text-muted)]">
                  No videos are tagged with <span className="font-semibold text-[var(--text-primary)]">{RUNABLE_INTEGRATION_VARIABLE_NAME}</span> yet.
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LateAnalyticsPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Suspense fallback={<div className="flex items-center justify-center py-32"><Spinner className="h-8 w-8" /></div>}>
        <LateAnalyticsContent />
      </Suspense>
    </div>
  );
}
