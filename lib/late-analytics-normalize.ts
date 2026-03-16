type MaybeId = string | { _id?: string | null } | null | undefined;

type RawMetricMap = Record<string, unknown>;

type RawMediaItem = {
  thumbnailUrl?: string;
  thumbnail_url?: string;
  coverImageUrl?: string;
  cover_image_url?: string;
  url?: string;
};

type RawPlatformAnalytics = {
  platform?: string;
  accountId?: MaybeId;
  profileId?: MaybeId;
  accountUsername?: string;
  username?: string;
  displayName?: string;
  platformPostUrl?: string;
  publishedAt?: string;
  analytics?: RawMetricMap;
  impressions?: unknown;
  reach?: unknown;
  likes?: unknown;
  comments?: unknown;
  shares?: unknown;
  saves?: unknown;
  clicks?: unknown;
  views?: unknown;
  engagementRate?: unknown;
};

type RawLateAnalyticsPost = {
  _id?: string;
  postId?: string;
  latePostId?: string;
  externalPostId?: string;
  content?: string;
  caption?: string;
  title?: string;
  publishedAt?: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  coverImageUrl?: string;
  cover_image_url?: string;
  mediaItems?: RawMediaItem[];
  analytics?: RawMetricMap;
  impressions?: unknown;
  reach?: unknown;
  likes?: unknown;
  comments?: unknown;
  shares?: unknown;
  saves?: unknown;
  clicks?: unknown;
  views?: unknown;
  engagementRate?: unknown;
  platforms?: RawPlatformAnalytics[];
  platformAnalytics?: RawPlatformAnalytics[];
};

export type NormalizedLateAnalyticsPost = {
  _id: string;
  postId: string;
  content: string;
  publishedAt: string;
  platformPostUrl?: string;
  thumbnailUrl?: string;
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
  platforms: Array<{
    platform: string;
    accountId: string;
    accountUsername: string;
    platformPostUrl?: string;
    publishedAt?: string;
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
  }>;
};

function toId(value: MaybeId): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value._id === 'string') return value._id;
  return '';
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^@+/, '');
}

function normalizeMetrics(source: RawMetricMap | undefined): NormalizedLateAnalyticsPost['analytics'] {
  const metrics = source || {};
  const views = toNumber(metrics.views);
  const likes = toNumber(metrics.likes);
  const comments = toNumber(metrics.comments);
  const shares = toNumber(metrics.shares);
  const saves = toNumber(metrics.saves);
  const clicks = toNumber(metrics.clicks);
  const impressions = toNumber(metrics.impressions);
  const reach = toNumber(metrics.reach);
  const engagementRate = toNumber(metrics.engagementRate) || (views > 0 ? ((likes + comments + shares) / views) * 100 : 0);

  return {
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    clicks,
    views,
    engagementRate,
  };
}

function platformToMetricMap(platform: RawPlatformAnalytics): RawMetricMap {
  return {
    ...(platform.analytics || {}),
    impressions: platform.analytics?.impressions ?? platform.impressions,
    reach: platform.analytics?.reach ?? platform.reach,
    likes: platform.analytics?.likes ?? platform.likes,
    comments: platform.analytics?.comments ?? platform.comments,
    shares: platform.analytics?.shares ?? platform.shares,
    saves: platform.analytics?.saves ?? platform.saves,
    clicks: platform.analytics?.clicks ?? platform.clicks,
    views: platform.analytics?.views ?? platform.views,
    engagementRate: platform.analytics?.engagementRate ?? platform.engagementRate,
  };
}

function postToMetricMap(post: RawLateAnalyticsPost): RawMetricMap {
  return {
    ...(post.analytics || {}),
    impressions: post.analytics?.impressions ?? post.impressions,
    reach: post.analytics?.reach ?? post.reach,
    likes: post.analytics?.likes ?? post.likes,
    comments: post.analytics?.comments ?? post.comments,
    shares: post.analytics?.shares ?? post.shares,
    saves: post.analytics?.saves ?? post.saves,
    clicks: post.analytics?.clicks ?? post.clicks,
    views: post.analytics?.views ?? post.views,
    engagementRate: post.analytics?.engagementRate ?? post.engagementRate,
  };
}

function extractPlatformEntries(post: RawLateAnalyticsPost): RawPlatformAnalytics[] {
  if (Array.isArray(post.platforms) && post.platforms.length > 0) return post.platforms;
  if (Array.isArray(post.platformAnalytics) && post.platformAnalytics.length > 0) return post.platformAnalytics;
  return [];
}

function firstDefinedString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

export function normalizeLateAnalyticsListParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  const profileId = searchParams.get('profileId') || searchParams.get('accountId');
  if (profileId) params.set('profileId', profileId);

  for (const key of ['platform', 'fromDate', 'toDate']) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  const sortBy = searchParams.get('sortBy');
  if (sortBy === 'engagement') {
    params.set('sortBy', 'engagement');
  } else {
    params.set('sortBy', 'date');
  }

  const order = searchParams.get('order') || searchParams.get('sortDirection') || 'desc';
  params.set('order', order === 'asc' ? 'asc' : 'desc');

  return params;
}

export function extractLateAnalyticsPosts(payload: unknown): RawLateAnalyticsPost[] {
  if (Array.isArray(payload)) return payload as RawLateAnalyticsPost[];
  if (!payload || typeof payload !== 'object') return [];

  const data = payload as {
    posts?: unknown;
    items?: unknown;
    data?: { posts?: unknown; items?: unknown };
  };

  if (Array.isArray(data.posts)) return data.posts as RawLateAnalyticsPost[];
  if (Array.isArray(data.items)) return data.items as RawLateAnalyticsPost[];
  if (data.data && Array.isArray(data.data.posts)) return data.data.posts as RawLateAnalyticsPost[];
  if (data.data && Array.isArray(data.data.items)) return data.data.items as RawLateAnalyticsPost[];
  return [];
}

export function normalizeLateAnalyticsPost(raw: RawLateAnalyticsPost): NormalizedLateAnalyticsPost {
  const rawPlatforms = extractPlatformEntries(raw);
  const platforms = rawPlatforms.map((platform) => ({
    platform: firstDefinedString(platform.platform),
    accountId: firstDefinedString(toId(platform.accountId), toId(platform.profileId)),
    accountUsername: normalizeUsername(platform.accountUsername || platform.username || platform.displayName),
    platformPostUrl: firstDefinedString(platform.platformPostUrl),
    publishedAt: firstDefinedString(platform.publishedAt),
    analytics: normalizeMetrics(platformToMetricMap(platform)),
  }));

  const topLevelMetrics = normalizeMetrics(postToMetricMap(raw));
  const aggregatedPlatformMetrics = platforms.reduce(
    (acc, platform) => {
      acc.impressions += platform.analytics.impressions;
      acc.reach += platform.analytics.reach;
      acc.likes += platform.analytics.likes;
      acc.comments += platform.analytics.comments;
      acc.shares += platform.analytics.shares;
      acc.saves += platform.analytics.saves;
      acc.clicks += platform.analytics.clicks;
      acc.views += platform.analytics.views;
      return acc;
    },
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0 }
  );

  const analytics = topLevelMetrics.views > 0 || topLevelMetrics.likes > 0 || topLevelMetrics.comments > 0
    ? topLevelMetrics
    : {
        ...aggregatedPlatformMetrics,
        engagementRate: aggregatedPlatformMetrics.views > 0
          ? ((aggregatedPlatformMetrics.likes + aggregatedPlatformMetrics.comments + aggregatedPlatformMetrics.shares) / aggregatedPlatformMetrics.views) * 100
          : 0,
      };

  const firstPlatformUrl = platforms.find((platform) => platform.platformPostUrl)?.platformPostUrl;
  const firstPlatformPublishedAt = platforms.find((platform) => platform.publishedAt)?.publishedAt;
  const firstMedia = Array.isArray(raw.mediaItems) ? raw.mediaItems[0] : undefined;

  const id = firstDefinedString(raw._id, raw.postId, raw.latePostId, raw.externalPostId);

  return {
    _id: id,
    postId: id,
    content: firstDefinedString(raw.content, raw.caption, raw.title),
    publishedAt: firstDefinedString(raw.publishedAt, firstPlatformPublishedAt),
    platformPostUrl: firstDefinedString(raw.platformPostUrl, firstPlatformUrl),
    thumbnailUrl: firstDefinedString(
      raw.thumbnailUrl,
      raw.thumbnail_url,
      raw.coverImageUrl,
      raw.cover_image_url,
      firstMedia?.thumbnailUrl,
      firstMedia?.thumbnail_url,
      firstMedia?.coverImageUrl,
      firstMedia?.cover_image_url,
      firstMedia?.url
    ) || undefined,
    analytics,
    platforms,
  };
}
