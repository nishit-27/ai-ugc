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
  dateRange: string;
  sortBy: string;
  profile?: string;
  customFrom?: string;
  customTo?: string;
};

export function useLateAnalytics() {
  const [posts, setPosts] = useState<PostAnalytics[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [followerStats, setFollowerStats] = useState<FollowerStat[]>([]);
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([]);
  const [postingFrequency, setPostingFrequency] = useState<PostingFrequency[]>([]);
  const [contentDecay, setContentDecay] = useState<ContentDecayBucket[]>([]);
  const [overview, setOverview] = useState<{ totalPosts: number; publishedPosts: number; scheduledPosts: number; lastSync: string | null } | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; platform: string; username: string; displayName?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ platform: '', dateRange: '30d', sortBy: 'newest' });
  const [lastSync, setLastSync] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    if (filters.dateRange === 'custom') {
      return {
        fromDate: filters.customFrom || new Date(2020, 0, 1).toISOString().split('T')[0],
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
    else if (filters.dateRange === 'all') start.setFullYear(2020, 0, 1);
    return {
      fromDate: start.toISOString().split('T')[0],
      toDate: end.toISOString().split('T')[0],
    };
  }, [filters.dateRange, filters.customFrom, filters.customTo]);

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
        // Extract unique accounts from posts
        const accountMap = new Map<string, { id: string; platform: string; username: string; displayName?: string }>();
        for (const p of rawPosts) {
          for (const plat of (p.platforms || [])) {
            if (plat.accountId && !accountMap.has(plat.accountId)) {
              accountMap.set(plat.accountId, {
                id: plat.accountId,
                platform: plat.platform,
                username: plat.accountUsername || plat.username || '',
                displayName: plat.displayName,
              });
            }
          }
        }
        setAccounts(Array.from(accountMap.values()));
      }

      if (dailyRes.status === 'fulfilled' && !dailyRes.value.error) {
        setDailyMetrics(dailyRes.value.dailyData || []);
      }

      if (followerRes.status === 'fulfilled' && !followerRes.value.error) {
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
        const rawSlots = bestTimeRes.value.slots || [];
        const mapped = rawSlots.map((s: any) => ({
          dayOfWeek: s.day_of_week ?? s.dayOfWeek ?? s.day ?? 0,
          hour: s.hour ?? s.time ?? 0,
          avgEngagement: s.avg_engagement ?? s.avgEngagement ?? s.engagement ?? 0,
          postCount: s.post_count ?? s.postCount ?? s.posts ?? 0,
        }));
        // If API slots have no engagement data, compute from posts
        const hasEngagement = mapped.some((s: any) => s.avgEngagement > 0);
        if (hasEngagement) {
          setBestTimes(mapped);
        } else {
          // Compute best times from posts publishedAt
          const slotMap = new Map<string, { dayOfWeek: number; hour: number; totalEng: number; count: number }>();
          const rawPosts = postsRes.status === 'fulfilled' ? (postsRes.value.posts || []) : [];
          for (const p of rawPosts) {
            if (!p.publishedAt) continue;
            const d = new Date(p.publishedAt);
            const dow = d.getUTCDay();
            const hr = d.getUTCHours();
            const key = `${dow}-${hr}`;
            if (!slotMap.has(key)) slotMap.set(key, { dayOfWeek: dow, hour: hr, totalEng: 0, count: 0 });
            const slot = slotMap.get(key)!;
            const a = p.analytics || {};
            slot.totalEng += (a.likes || 0) + (a.comments || 0) + (a.shares || 0);
            slot.count += 1;
          }
          setBestTimes(Array.from(slotMap.values()).map(s => ({
            dayOfWeek: s.dayOfWeek,
            hour: s.hour,
            avgEngagement: s.count > 0 ? s.totalEng / s.count : 0,
            postCount: s.count,
          })));
        }
      }

      if (freqRes.status === 'fulfilled' && !freqRes.value.error) {
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
        const rawBuckets = decayRes.value.decay || decayRes.value.buckets || [];
        // Check if data is already bucketed (has bucket_label) or raw post data
        const isBucketed = rawBuckets.length > 0 && (rawBuckets[0].bucket_label || rawBuckets[0].label);
        if (isBucketed) {
          setContentDecay(rawBuckets.map((b: any) => ({
            label: b.bucket_label ?? b.label ?? '',
            percentage: Math.round(b.avg_pct_of_final ?? b.percentage ?? 0),
            postCount: b.post_count ?? b.postCount ?? 0,
          })));
        } else {
          // Compute decay buckets from posts data
          const rawPosts = postsRes.status === 'fulfilled' ? (postsRes.value.posts || []) : [];
          const bucketDefs = [
            { label: '0-6h', maxHours: 6 },
            { label: '6-12h', maxHours: 12 },
            { label: '12-24h', maxHours: 24 },
            { label: '1-2d', maxHours: 48 },
            { label: '2-7d', maxHours: 168 },
            { label: '7-30d', maxHours: 720 },
            { label: '30d+', maxHours: Infinity },
          ];
          const now = Date.now();
          const bucketCounts = bucketDefs.map(() => ({ totalViews: 0, postCount: 0 }));
          let grandTotalViews = 0;

          for (const p of rawPosts) {
            if (!p.publishedAt) continue;
            const ageHours = (now - new Date(p.publishedAt).getTime()) / 3600000;
            const views = p.analytics?.views || 0;
            grandTotalViews += views;
            for (let i = 0; i < bucketDefs.length; i++) {
              if (ageHours <= bucketDefs[i].maxHours) {
                bucketCounts[i].totalViews += views;
                bucketCounts[i].postCount += 1;
                break;
              }
            }
          }

          // Per-bucket percentage: what % of total views each bucket holds
          setContentDecay(bucketDefs.map((def, i) => {
            const pct = grandTotalViews > 0 ? Math.round((bucketCounts[i].totalViews / grandTotalViews) * 100) : 0;
            return { label: def.label, percentage: pct, postCount: bucketCounts[i].postCount };
          }));
        }
      }

      // Use the real API sync timestamp, fallback to current time
      setLastSync(overview?.lastSync || new Date().toISOString());
    } catch (err) {
      console.error('Failed to load late analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, filters.platform, filters.sortBy]);

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
    accounts,
    loading,
    filters,
    setFilters,
    lastSync,
    refresh: loadAll,
  };
}
