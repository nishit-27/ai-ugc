'use client';

import { Suspense } from 'react';
import { useLateAnalytics } from '@/hooks/useLateAnalytics';
import Spinner from '@/components/ui/Spinner';
import LateAnalyticsFilters from '@/components/late-analytics/LateAnalyticsFilters';
import LateMetricCards from '@/components/late-analytics/LateMetricCards';
import LateFollowerChart from '@/components/late-analytics/LateFollowerChart';
import LateDailyChart from '@/components/late-analytics/LateDailyChart';
import LatePlatformBreakdown from '@/components/late-analytics/LatePlatformBreakdown';
import LateBestTimeHeatmap from '@/components/late-analytics/LateBestTimeHeatmap';
import LateTopPosts from '@/components/late-analytics/LateTopPosts';
import LatePostingFrequency from '@/components/late-analytics/LatePostingFrequency';
import LateContentDecay from '@/components/late-analytics/LateContentDecay';
import LatePostGrid from '@/components/late-analytics/LatePostGrid';
import LatePostingHeatmap from '@/components/late-analytics/LatePostingHeatmap';

function LateAnalyticsContent() {
  const {
    posts,
    dailyMetrics,
    followerStats,
    bestTimes,
    postingFrequency,
    contentDecay,
    overview,
    loading,
    filters,
    setFilters,
    lastSync,
    refresh,
  } = useLateAnalytics();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  // Compute aggregate metrics from daily-metrics (accurate cross-key aggregation)
  // Falls back to posts if daily-metrics is empty
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

  // Build platform breakdown from posts using per-platform analytics
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
      <LateAnalyticsFilters filters={filters} setFilters={setFilters} lastSync={lastSync} onRefresh={refresh} />

      <LatePostingHeatmap posts={posts} />

      <div className="grid grid-cols-1 gap-6">
        <LateFollowerChart followerStats={followerStats} totalFollowers={totalFollowers} />
      </div>

      <LateMetricCards totals={totals} totalFollowers={totalFollowers} />

      <LateDailyChart dailyMetrics={dailyMetrics} />

      <LatePlatformBreakdown platforms={platformTotals} totalFollowers={totalFollowers} followerStats={followerStats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LateBestTimeHeatmap bestTimes={bestTimes} />
        <LateTopPosts posts={posts} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LatePostingFrequency data={postingFrequency} />
        <LateContentDecay data={contentDecay} />
      </div>

      <LatePostGrid posts={posts} />
    </div>
  );
}

export default function LateAnalyticsPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <Suspense fallback={<div className="flex items-center justify-center py-32"><Spinner className="h-8 w-8" /></div>}>
        <LateAnalyticsContent />
      </Suspense>
    </div>
  );
}
