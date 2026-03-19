import { getDateKeyInTimeZone } from '@/lib/dateUtils';
import type { NormalizedLateAnalyticsPost } from '@/lib/late-analytics-normalize';

type DateLike = string | Date | null | undefined;

export type LocalLateAnalyticsPostRow = {
  id: string;
  jobId?: string | null;
  lateAccountId?: string | null;
  caption?: string | null;
  platform?: string | null;
  publishedAt?: DateLike;
  externalPostId?: string | null;
  latePostId?: string | null;
  platformPostUrl?: string | null;
  lastCheckedAt?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
  accountUsername?: string | null;
  accountDisplayName?: string | null;
};

type FallbackPost = NormalizedLateAnalyticsPost & {
  variableValues: Record<string, string>;
};

type BuildFallbackPostsParams = {
  rows: LocalLateAnalyticsPostRow[];
  jobVariableValuesByJobId?: Record<string, Record<string, string>>;
  existingExternalIds?: Iterable<string>;
  fromDate?: string | null;
  toDate?: string | null;
};

type ResolvedRow = LocalLateAnalyticsPostRow & {
  resolvedPublishedAt: string;
};

function toIsoString(value: DateLike): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString();
}

function resolvePublishedAt(row: LocalLateAnalyticsPostRow): string {
  return (
    toIsoString(row.publishedAt) ||
    toIsoString(row.lastCheckedAt) ||
    toIsoString(row.updatedAt) ||
    toIsoString(row.createdAt)
  );
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function normalizeUsername(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^@+/, '');
}

function collectAliases(row: LocalLateAnalyticsPostRow): string[] {
  return [row.latePostId, row.externalPostId, row.id]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim());
}

function compareIsoAsc(a: string, b: string): number {
  return a.localeCompare(b);
}

export function buildLateAnalyticsFallbackPosts({
  rows,
  jobVariableValuesByJobId = {},
  existingExternalIds = [],
  fromDate,
  toDate,
}: BuildFallbackPostsParams): FallbackPost[] {
  const existingIds = new Set(
    Array.from(existingExternalIds).filter((value): value is string => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
  );

  const groups = new Map<string, { rows: ResolvedRow[]; aliases: Set<string>; variableValues: Record<string, string> }>();

  for (const row of rows) {
    const resolvedPublishedAt = resolvePublishedAt(row);
    if (!resolvedPublishedAt) continue;

    const dateKey = getDateKeyInTimeZone(resolvedPublishedAt);
    if (fromDate && dateKey < fromDate) continue;
    if (toDate && dateKey > toDate) continue;

    const aliases = collectAliases(row);
    const groupKey = aliases[0];
    if (!groupKey) continue;

    const group = groups.get(groupKey) || {
      rows: [],
      aliases: new Set<string>(),
      variableValues: {},
    };

    for (const alias of aliases) group.aliases.add(alias);
    if (row.jobId && jobVariableValuesByJobId[row.jobId]) {
      Object.assign(group.variableValues, jobVariableValuesByJobId[row.jobId]);
    }

    group.rows.push({
      ...row,
      resolvedPublishedAt,
    });
    groups.set(groupKey, group);
  }

  const fallbackPosts: FallbackPost[] = [];

  for (const [groupKey, group] of groups) {
    if (Array.from(group.aliases).some((alias) => existingIds.has(alias))) continue;

    const sortedRows = [...group.rows].sort((a, b) => compareIsoAsc(a.resolvedPublishedAt, b.resolvedPublishedAt));
    const primaryRow = sortedRows[0];
    const platforms = sortedRows.map((row) => ({
      platform: firstNonEmptyString(row.platform),
      accountId: firstNonEmptyString(row.lateAccountId),
      accountUsername: normalizeUsername(row.accountUsername || row.accountDisplayName),
      platformPostId: firstNonEmptyString(row.externalPostId) || undefined,
      platformPostUrl: firstNonEmptyString(row.platformPostUrl) || undefined,
      publishedAt: row.resolvedPublishedAt || undefined,
      analytics: {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
        engagementRate: 0,
      },
    }));

    fallbackPosts.push({
      _id: groupKey,
      postId: groupKey,
      content: firstNonEmptyString(primaryRow.caption),
      publishedAt: primaryRow.resolvedPublishedAt,
      platformPostUrl: firstNonEmptyString(...sortedRows.map((row) => row.platformPostUrl)) || undefined,
      analytics: {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
        engagementRate: 0,
      },
      platforms,
      variableValues: group.variableValues,
    });
  }

  fallbackPosts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return fallbackPosts;
}
