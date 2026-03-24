'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getDateKeyInTimeZone, getTodayDateKey, shiftDateKey } from '@/lib/dateUtils';

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
  variableValues?: Record<string, string>;
  platforms: {
    platform: string;
    accountId: string;
    accountUsername: string;
    username?: string;
    displayName?: string;
    analytics?: Record<string, number>;
  }[];
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
  groups?: string[];
};

type RawPostAnalytics = {
  _id?: string;
  postId?: string;
  content?: string;
  publishedAt?: string;
  status?: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
  variableValues?: Record<string, string>;
  platforms?: PostAnalytics['platforms'];
  analytics?: Partial<PostAnalytics['analytics']>;
};

type RawFollowerStat = {
  _id?: string;
  accountId?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  currentFollowers?: number;
  followerCount?: number;
  growth?: number;
  followerGrowth?: number;
  growthPercentage?: number;
  growthRate?: number;
  dataPoints?: number;
};

type RawBestTimeSlot = {
  day_of_week?: number;
  dayOfWeek?: number;
  day?: number;
  hour?: number;
  time?: number;
  avg_engagement?: number;
  avgEngagement?: number;
  engagement?: number;
  post_count?: number;
  postCount?: number;
  posts?: number;
};

type RawPostingFrequency = {
  platform?: string;
  posts_per_week?: number;
  postsPerWeek?: number;
  avg_engagement_rate?: number;
  averageEngagementRate?: number;
  avg_engagement?: number;
  averageEngagement?: number;
  weeks_count?: number;
  weeksCount?: number;
};

type RawContentDecayBucket = {
  bucket_label?: string;
  label?: string;
  avg_pct_of_final?: number;
  percentage?: number;
  post_count?: number;
  postCount?: number;
};

type GroupAccountMap = { name: string; accountIds: string[] };

// Module-level cache so navigating away and back doesn't re-fetch
let _allPostsCache: PostAnalytics[] = [];
let _overviewCache: { totalPosts: number; publishedPosts: number; scheduledPosts: number; lastSync: string | null } | null = null;
let _accountsCache: { id: string; platform: string; username: string; displayName?: string }[] = [];
let _groupAccountsCache: GroupAccountMap[] = [];
let _cacheTime = 0;
let _cachedDateKey = '';
const CACHE_TTL = 5 * 60_000; // 5 minutes
const ANALYTICS_START_DATE = '2020-01-01';

export function useLateAnalytics() {
  const [allPosts, setAllPosts] = useState<PostAnalytics[]>(_allPostsCache);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [followerStats, setFollowerStats] = useState<FollowerStat[]>([]);
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([]);
  const [postingFrequency, setPostingFrequency] = useState<PostingFrequency[]>([]);
  const [contentDecay, setContentDecay] = useState<ContentDecayBucket[]>([]);
  const [overview, setOverview] = useState(_overviewCache);
  const [accounts, setAccounts] = useState(_accountsCache);
  const [groupAccounts, setGroupAccounts] = useState<GroupAccountMap[]>(_groupAccountsCache);
  const [loading, setLoading] = useState(_allPostsCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>({ platform: '', dateRange: '30d', sortBy: 'newest' });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const postsLoaded = useRef(_allPostsCache.length > 0);

  const getDateRange = useCallback(() => {
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

  // Heavy fetch: posts from GetLate for current date range (only on mount or manual refresh)
  const loadPosts = useCallback(async (force = false) => {
    const { fromDate, toDate } = getDateRange();
    const cacheKey = `${fromDate}_${toDate}`;
    const now = Date.now();
    if (!force && _allPostsCache.length > 0 && now - _cacheTime < CACHE_TTL && _cachedDateKey === cacheKey) {
      setAllPosts(_allPostsCache);
      setOverview(_overviewCache);
      setAccounts(_accountsCache);
      setLoading(false);
      postsLoaded.current = true;
      return;
    }

    setLoading(!postsLoaded.current);
    try {
      const res = await fetch(`/api/late-analytics?sortBy=date&order=desc&fromDate=${fromDate}&toDate=${toDate}`, { cache: 'no-store' });
      const data = res.ok
        ? await res.json() as { posts?: RawPostAnalytics[]; overview?: { totalPosts: number; publishedPosts: number; scheduledPosts: number; lastSync: string | null } | null }
        : { posts: [] as RawPostAnalytics[] };
      const rawPosts = data.posts || [];
      const mapped: PostAnalytics[] = rawPosts.flatMap((p) => {
        const postId = p._id || p.postId;
        if (!postId) return [];

        return [{
          postId,
          content: p.content || '',
          publishedAt: p.publishedAt || '',
          status: p.status,
          platformPostUrl: p.platformPostUrl,
          thumbnailUrl: p.thumbnailUrl,
          variableValues: p.variableValues || {},
          platforms: p.platforms || [],
          analytics: {
            impressions: p.analytics?.impressions || 0,
            reach: p.analytics?.reach || 0,
            likes: p.analytics?.likes || 0,
            comments: p.analytics?.comments || 0,
            shares: p.analytics?.shares || 0,
            saves: p.analytics?.saves || 0,
            clicks: p.analytics?.clicks || 0,
            views: p.analytics?.views || 0,
            engagementRate: p.analytics?.engagementRate || 0,
          },
        }];
      });

      _allPostsCache = mapped;
      _overviewCache = data.overview || null;
      _cacheTime = Date.now();
      _cachedDateKey = cacheKey;
      setAllPosts(mapped);
      setOverview(data.overview || null);
      setLastSync(data.overview?.lastSync || new Date().toISOString());

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
      _accountsCache = Array.from(accountMap.values());
      setAccounts(_accountsCache);
      postsLoaded.current = true;
    } catch (err) {
      console.error('Failed to load late analytics posts:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Light fetch: daily-metrics, follower-stats, best-time, etc. (depends on filters)
  const loadSecondary = useCallback(async () => {
    setRefreshing(true);
    try {
      const { fromDate, toDate } = getDateRange();
      const platformParam = filters.platform ? `&platform=${filters.platform}` : '';
      const dateParams = `fromDate=${fromDate}&toDate=${toDate}`;

      const [dailyRes, followerRes, bestTimeRes, freqRes, decayRes] = await Promise.allSettled([
        fetch(`/api/late-analytics/daily-metrics?${dateParams}${platformParam}`).then(r => r.json()),
        fetch(`/api/late-analytics/follower-stats`).then(r => r.json()),
        fetch(`/api/late-analytics/best-time${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
        fetch(`/api/late-analytics/posting-frequency${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
        fetch(`/api/late-analytics/content-decay${platformParam ? '?' + platformParam.slice(1) : ''}`).then(r => r.json()),
      ]);

      if (dailyRes.status === 'fulfilled' && !dailyRes.value.error) {
        setDailyMetrics(dailyRes.value.dailyData || []);
      }

      if (followerRes.status === 'fulfilled' && !followerRes.value.error) {
        const rawAccounts = (followerRes.value.accounts || []) as RawFollowerStat[];
        setFollowerStats(rawAccounts.flatMap((a) => {
          const accountId = a._id || a.accountId;
          if (!accountId) return [];

          return [{
            accountId,
            platform: a.platform || '',
            username: a.username || '',
            displayName: a.displayName,
            followerCount: a.currentFollowers ?? a.followerCount ?? 0,
            followerGrowth: a.growth ?? a.followerGrowth ?? 0,
            growthRate: a.growthPercentage ?? a.growthRate ?? 0,
            dataPoints: a.dataPoints ?? 0,
          }];
        }));
      }

      if (bestTimeRes.status === 'fulfilled' && !bestTimeRes.value.error) {
        const rawSlots = (bestTimeRes.value.slots || []) as RawBestTimeSlot[];
        const mapped = rawSlots.map((s) => ({
          dayOfWeek: s.day_of_week ?? s.dayOfWeek ?? s.day ?? 0,
          hour: s.hour ?? s.time ?? 0,
          avgEngagement: s.avg_engagement ?? s.avgEngagement ?? s.engagement ?? 0,
          postCount: s.post_count ?? s.postCount ?? s.posts ?? 0,
        }));
        const hasEngagement = mapped.some((s) => s.avgEngagement > 0);
        if (hasEngagement) {
          setBestTimes(mapped);
        } else {
          // Compute best times from all posts
          const slotMap = new Map<string, { dayOfWeek: number; hour: number; totalEng: number; count: number }>();
          for (const p of allPosts) {
            if (!p.publishedAt) continue;
            const d = new Date(p.publishedAt);
            const dow = d.getUTCDay();
            const hr = d.getUTCHours();
            const key = `${dow}-${hr}`;
            if (!slotMap.has(key)) slotMap.set(key, { dayOfWeek: dow, hour: hr, totalEng: 0, count: 0 });
            const slot = slotMap.get(key)!;
            const analytics = p.analytics;
            slot.totalEng += (analytics.likes || 0) + (analytics.comments || 0) + (analytics.shares || 0);
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
        const rawFreq = (freqRes.value.frequency || []) as RawPostingFrequency[];
        setPostingFrequency(rawFreq.map((f) => ({
          platform: f.platform || '',
          postsPerWeek: f.posts_per_week ?? f.postsPerWeek ?? 0,
          averageEngagementRate: f.avg_engagement_rate ?? f.averageEngagementRate ?? 0,
          averageEngagement: f.avg_engagement ?? f.averageEngagement ?? 0,
          weeksCount: f.weeks_count ?? f.weeksCount ?? 0,
        })));
      }

      if (decayRes.status === 'fulfilled' && !decayRes.value.error) {
        const rawBuckets = (decayRes.value.decay || decayRes.value.buckets || []) as RawContentDecayBucket[];
        const isBucketed = rawBuckets.length > 0 && (rawBuckets[0].bucket_label || rawBuckets[0].label);
        if (isBucketed) {
          setContentDecay(rawBuckets.map((b) => ({
            label: b.bucket_label ?? b.label ?? '',
            percentage: Math.round(b.avg_pct_of_final ?? b.percentage ?? 0),
            postCount: b.post_count ?? b.postCount ?? 0,
          })));
        } else {
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

          for (const p of allPosts) {
            if (!p.publishedAt) continue;
            const ageHours = (now - new Date(p.publishedAt).getTime()) / 3600000;
            const views = p.analytics.views || 0;
            grandTotalViews += views;
            for (let i = 0; i < bucketDefs.length; i++) {
              if (ageHours <= bucketDefs[i].maxHours) {
                bucketCounts[i].totalViews += views;
                bucketCounts[i].postCount += 1;
                break;
              }
            }
          }

          setContentDecay(bucketDefs.map((def, i) => {
            const pct = grandTotalViews > 0 ? Math.round((bucketCounts[i].totalViews / grandTotalViews) * 100) : 0;
            return { label: def.label, percentage: pct, postCount: bucketCounts[i].postCount };
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load late analytics secondary:', err);
    } finally {
      setRefreshing(false);
    }
  }, [getDateRange, filters.platform, allPosts]);

  // Client-side filtered + sorted posts (instant, no API call)
  const posts = useMemo(() => {
    let result = allPosts;

    // Date filter
    const { fromDate, toDate } = getDateRange();
    result = result.filter(p => {
      if (!p.publishedAt) return false;
      const d = getDateKeyInTimeZone(p.publishedAt);
      return d >= fromDate && d <= toDate;
    });

    // Platform filter
    if (filters.platform) {
      result = result.filter(p =>
        (p.platforms || []).some(pl => pl.platform === filters.platform)
      );
    }

    if (filters.profile) {
      const wanted = filters.profile.trim().replace(/^@+/, '').toLowerCase();
      result = result.filter(p =>
        (p.platforms || []).some((pl) => (pl.accountUsername || '').trim().replace(/^@+/, '').toLowerCase() === wanted)
      );
    }

    // Group filter (multi-select)
    if (filters.groups && filters.groups.length > 0) {
      const accountIdSet = new Set<string>();
      for (const groupName of filters.groups) {
        const group = groupAccounts.find((g) => g.name === groupName);
        if (group) {
          for (const id of group.accountIds) accountIdSet.add(id);
        }
      }
      if (accountIdSet.size > 0) {
        result = result.filter(p =>
          (p.platforms || []).some((pl) => accountIdSet.has(pl.accountId))
        );
      } else {
        result = [];
      }
    }

    // Sort
    const sorted = [...result];
    if (filters.sortBy === 'oldest') {
      sorted.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
    } else if (filters.sortBy === 'engagement') {
      sorted.sort((a, b) => {
        const ae = a.analytics.engagementRate || 0;
        const be = b.analytics.engagementRate || 0;
        return be - ae;
      });
    } else {
      // newest first (default)
      sorted.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    }

    return sorted;
  }, [allPosts, filters.platform, filters.profile, filters.groups, filters.sortBy, getDateRange, groupAccounts]);

  // Load group accounts
  useEffect(() => {
    if (_groupAccountsCache.length > 0) return;
    fetch('/api/model-groups/accounts')
      .then((r) => r.json())
      .then((data) => {
        const groups = data.groups || [];
        _groupAccountsCache = groups;
        setGroupAccounts(groups);
      })
      .catch(console.error);
  }, []);

  // Load posts once on mount
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Load secondary data when posts are loaded or filters change
  useEffect(() => {
    if (postsLoaded.current) {
      loadSecondary();
    }
  }, [loadSecondary]);

  const refresh = useCallback(async () => {
    await loadPosts(true);
    await loadSecondary();
  }, [loadPosts, loadSecondary]);

  const updateFilters = useCallback((next: Filters) => {
    // Only show refresh/loading state for changes that require new API data
    const needsApiFetch =
      filters.platform !== next.platform ||
      filters.dateRange !== next.dateRange ||
      filters.customFrom !== next.customFrom ||
      filters.customTo !== next.customTo;

    if (needsApiFetch) {
      setRefreshing(true);
    }

    setFilters(next);
  }, [filters]);

  return {
    posts,
    dailyMetrics,
    followerStats,
    bestTimes,
    postingFrequency,
    contentDecay,
    overview,
    accounts,
    groupAccounts,
    loading,
    refreshing,
    filters,
    setFilters: updateFilters,
    lastSync,
    refresh,
  };
}
