'use client';

import { Suspense, useMemo, useCallback } from 'react';
import { useLateAnalytics } from '@/hooks/useLateAnalytics';
import Spinner from '@/components/ui/Spinner';
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

function LateAnalyticsContent() {
  const {
    posts,
    dailyMetrics,
    followerStats,
    bestTimes,
    postingFrequency,
    contentDecay,
    overview,
    accounts,
    loading,
    filters,
    setFilters,
    lastSync,
    refresh,
  } = useLateAnalytics();

  // Compute date range for child components
  const dateRange = useMemo(() => {
    if (filters.dateRange === 'custom') {
      return {
        fromDate: filters.customFrom || '2020-01-01',
        toDate: filters.customTo || new Date().toISOString().split('T')[0],
      };
    }
    const end = new Date();
    const start = new Date();
    if (filters.dateRange === '7d') start.setDate(end.getDate() - 7);
    else if (filters.dateRange === '30d') start.setDate(end.getDate() - 30);
    else if (filters.dateRange === '90d') start.setDate(end.getDate() - 90);
    else if (filters.dateRange === '180d') start.setDate(end.getDate() - 180);
    else if (filters.dateRange === '365d') start.setDate(end.getDate() - 365);
    else start.setFullYear(2020, 0, 1);
    return {
      fromDate: start.toISOString().split('T')[0],
      toDate: end.toISOString().split('T')[0],
    };
  }, [filters.dateRange, filters.customFrom, filters.customTo]);

  const handleDownload = useCallback(() => {
    if (posts.length === 0) return;
    const headers = ['Post ID', 'Content', 'Published', 'Platform', 'Account', 'Views', 'Likes', 'Comments', 'Shares', 'Impressions', 'Reach', 'Engagement %'];
    const rows = posts.map(post => {
      const p = post.platforms?.[0];
      const a = post.analytics || {} as any;
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
    link.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [posts]);

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
    <div className="space-y-6">
      <LateAnalyticsFilters filters={filters} setFilters={setFilters} lastSync={lastSync} onRefresh={refresh} onDownload={handleDownload} accounts={accounts} />

      <LateMetricCards totals={totals} totalFollowers={totalFollowers} />

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-[var(--border)] pb-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-6">
          <LateMetricsChart dailyMetrics={dailyMetrics} />
          <LatePostingActivity dailyMetrics={dailyMetrics} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LateFollowerChart followerStats={followerStats} totalFollowers={totalFollowers} />
            <LateAccountViewsChart accounts={accounts} posts={posts} dateRange={dateRange} />
          </div>
          <LateDailyChart dailyMetrics={dailyMetrics} />
          <LatePlatformBreakdown platforms={platformTotals} totalFollowers={totalFollowers} followerStats={followerStats} />
        </TabsContent>

        <TabsContent value="engagement" className="space-y-6 pt-6">
          <LateMetricsChart dailyMetrics={dailyMetrics} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LateBestTimeHeatmap bestTimes={bestTimes} />
            <LateTopPosts posts={posts} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LatePostingFrequency data={postingFrequency} />
            <LateContentDecay data={contentDecay} />
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="pt-6">
          <LateAccountsTable followerStats={followerStats} posts={posts} />
        </TabsContent>

        <TabsContent value="content" className="pt-6">
          <LateContentTable posts={posts} accounts={accounts} />
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
