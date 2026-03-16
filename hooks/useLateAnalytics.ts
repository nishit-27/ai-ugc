'use client';

import { useState, useCallback, useEffect } from 'react';

type DailyMetric = {
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
};

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
  content: string;
  publishedAt: string;
  status?: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
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
    engagementRate: number;
  };
};

type BestTimeSlot = {
  dayOfWeek: number;
  hour: number;
  avgEngagement: number;
  postCount?: number;
};

type PostingFrequency = {
  platform: string;
  postsPerWeek: number;
  averageEngagementRate: number;
  averageEngagement?: number;
  weeksCount?: number;
};

type ContentDecayBucket = {
  label: string;
  percentage: number;
  postCount?: number;
};

type Filters = {
  platform: string;
  dateRange: string; // '7d' | '30d' | '90d'
  sortBy: string;
};

export function useLateAnalytics() {
  const [posts, setPosts] = useState<PostAnalytics[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [followerStats, setFollowerStats] = useState<FollowerStat[]>([]);
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([]);
  const [postingFrequency, setPostingFrequency] = useState<PostingFrequency[]>([]);
  const [contentDecay, setContentDecay] = useState<ContentDecayBucket[]>([]);
  const [overview, setOverview] = useState<{ totalPosts: number; publishedPosts: number; scheduledPosts: number; lastSync: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ platform: '', dateRange: '30d', sortBy: 'newest' });
  const [lastSync, setLastSync] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    const end = new Date();
    const start = new Date();
    if (filters.dateRange === '7d') start.setDate(end.getDate() - 7);
    else if (filters.dateRange === '30d') start.setDate(end.getDate() - 30);
    else if (filters.dateRange === '90d') start.setDate(end.getDate() - 90);
    else if (filters.dateRange === '180d') start.setDate(end.getDate() - 180);
    else if (filters.dateRange === '365d') start.setDate(end.getDate() - 365);
    else if (filters.dateRange === 'all') start.setFullYear(2020, 0, 1);
    return {
      fromDate: start.toISOString().split('T')[0],
      toDate: end.toISOString().split('T')[0],
    };
  }, [filters.dateRange]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { fromDate, toDate } = getDateRange();
      const platformParam = filters.platform ? `&platform=${filters.platform}` : '';
      const dateParams = `&fromDate=${fromDate}&toDate=${toDate}`;
      const sortParam = filters.sortBy === 'oldest' ? '&sortBy=publishedAt&sortDirection=asc'
        : filters.sortBy === 'engagement' ? '&sortBy=engagement&sortDirection=desc'
        : '&sortBy=publishedAt&sortDirection=desc';

      const [postsRes, dailyRes, followerRes, bestTimeRes, freqRes, decayRes] = await Promise.allSettled([
        fetch(`/api/late-analytics?limit=100000${sortParam}${platformParam}${dateParams}`).then(r => r.json()),
        fetch(`/api/late-analytics/daily-metrics?fromDate=${fromDate}&toDate=${toDate}${platformParam}`).then(r => r.json()),
        fetch(`/api/late-analytics/follower-stats`).then(r => r.json()),
        fetch(`/api/late-analytics/best-time${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
        fetch(`/api/late-analytics/posting-frequency${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
        fetch(`/api/late-analytics/content-decay${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
      ]);

      if (postsRes.status === 'fulfilled' && !postsRes.value.error) {
        const rawPosts = postsRes.value.posts || [];
        setPosts(rawPosts.map((p: any) => ({
          postId: p._id || p.postId,
          content: p.content,
          publishedAt: p.publishedAt,
          status: p.status,
          platformPostUrl: p.platformPostUrl,
          thumbnailUrl: p.thumbnailUrl,
          platforms: p.platforms || [],
          analytics: p.analytics || {},
        })));
        setOverview(postsRes.value.overview || null);
      }

      if (dailyRes.status === 'fulfilled' && !dailyRes.value.error) {
        // API returns { dailyData: [...] } with per-day { date, postCount, metrics: {...}, platforms: {...} }
        setDailyMetrics(dailyRes.value.dailyData || []);
      }

      if (followerRes.status === 'fulfilled' && !followerRes.value.error) {
        // API returns { accounts: [...] } with { _id, platform, username, currentFollowers, growth, growthPercentage, dataPoints (number) }
        const rawAccounts = followerRes.value.accounts || [];
        setFollowerStats(rawAccounts.map((a: any) => ({
          accountId: a._id || a.accountId,
          platform: a.platform,
          username: a.username,
          displayName: a.displayName,
          followerCount: a.currentFollowers ?? a.followerCount ?? 0,
          followerGrowth: a.growth ?? a.followerGrowth ?? 0,
          growthRate: a.growthPercentage ?? a.growthRate ?? 0,
          dataPoints: a.dataPoints ?? 0,
        })));
      }

      if (bestTimeRes.status === 'fulfilled' && !bestTimeRes.value.error) {
        // API returns { slots: [...] } with snake_case: { day_of_week, hour, avg_engagement, post_count }
        const rawSlots = bestTimeRes.value.slots || [];
        setBestTimes(rawSlots.map((s: any) => ({
          dayOfWeek: s.day_of_week ?? s.dayOfWeek ?? 0,
          hour: s.hour ?? 0,
          avgEngagement: s.avg_engagement ?? s.avgEngagement ?? 0,
          postCount: s.post_count ?? s.postCount ?? 0,
        })));
      }

      if (freqRes.status === 'fulfilled' && !freqRes.value.error) {
        // API returns { frequency: [...] } with snake_case: { platform, posts_per_week, avg_engagement_rate, avg_engagement, weeks_count }
        const rawFreq = freqRes.value.frequency || [];
        setPostingFrequency(rawFreq.map((f: any) => ({
          platform: f.platform,
          postsPerWeek: f.posts_per_week ?? f.postsPerWeek ?? 0,
          averageEngagementRate: f.avg_engagement_rate ?? f.averageEngagementRate ?? 0,
          averageEngagement: f.avg_engagement ?? f.averageEngagement ?? 0,
          weeksCount: f.weeks_count ?? f.weeksCount ?? 0,
        })));
      }

      if (decayRes.status === 'fulfilled' && !decayRes.value.error) {
        // API returns { buckets: [...] } with { bucket_order, bucket_label, avg_pct_of_final, post_count }
        const rawBuckets = decayRes.value.buckets || [];
        setContentDecay(rawBuckets.map((b: any) => ({
          label: b.bucket_label ?? b.label ?? '',
          percentage: Math.round(b.avg_pct_of_final ?? b.percentage ?? 0),
          postCount: b.post_count ?? b.postCount ?? 0,
        })));
      }

      setLastSync(new Date().toISOString());
    } catch (err) {
      console.error('Failed to load late analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, filters.platform]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
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
    refresh: loadAll,
  };
}
