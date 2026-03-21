import { NextResponse } from 'next/server';
import {
  ensureDatabaseReady,
  getMediaVariableValuesByExternalIds,
  getJobVariableValuesByTemplateJobIds,
  getPostVariableValuesByExternalIds,
  sql,
} from '@/lib/db';
import { getApiKeys } from '@/lib/lateAccountPool';
import { lateApiRequest } from '@/lib/lateApi';
import { shiftDateKey } from '@/lib/dateUtils';
import {
  buildLateAnalyticsFallbackPosts,
  type LocalLateAnalyticsPostRow,
} from '@/lib/late-analytics-local-posts';
import {
  extractLateAnalyticsPosts,
  type NormalizedLateAnalyticsPost,
  normalizeLateAnalyticsListParams,
  normalizeLateAnalyticsPost,
} from '@/lib/late-analytics-normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GetLate API returns max 100 per page, uses page-based (not offset-based) pagination
const PAGE_SIZE = 100;
const PARALLEL_PAGES = 20;

type LocalLateAnalyticsDbRow = {
  id: string;
  job_id: string | null;
  late_account_id: string | null;
  caption: string | null;
  platform: string | null;
  published_at: string | Date | null;
  external_post_id: string | null;
  late_post_id: string | null;
  platform_post_url: string | null;
  last_checked_at: string | Date | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  account_username: string | null;
  account_display_name: string | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseParams = normalizeLateAnalyticsListParams(searchParams);
    const fromDate = baseParams.get('fromDate');
    const toDate = baseParams.get('toDate');
    const platform = baseParams.get('platform');
    const widenedFromBound = fromDate ? `${shiftDateKey(fromDate, -1)}T00:00:00.000Z` : null;
    const widenedToBound = toDate ? `${shiftDateKey(toDate, 1)}T23:59:59.999Z` : null;

    const keys = getApiKeys();
    const rawPosts: ReturnType<typeof extractLateAnalyticsPosts> = [];
    const overview = {
      totalPosts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      lastSync: null as string | null,
    };
    let latestSyncMs = 0;

    const fetchPage = async (apiKey: string, page: number) => {
      const params = new URLSearchParams(baseParams);
      params.set('limit', params.get('limit') || String(PAGE_SIZE));
      params.set('page', String(page));
      return lateApiRequest<unknown>(`/analytics?${params.toString()}`, { apiKey });
    };

    // Fetch all keys in parallel
    const keyResults = await Promise.allSettled(
      keys.map(async (apiKey) => {
        // Step 1: Fetch first page to get totalPosts count
        const firstPage = await fetchPage(apiKey, 1);
        const firstPosts = extractLateAnalyticsPosts(firstPage);
        const firstPageData = firstPage as {
          overview?: {
            totalPosts?: number;
            publishedPosts?: number;
            scheduledPosts?: number;
            lastSync?: string;
          };
        };

        if (firstPageData?.overview) {
          overview.totalPosts = Math.max(overview.totalPosts, firstPageData.overview.totalPosts || 0);
          overview.publishedPosts = Math.max(overview.publishedPosts, firstPageData.overview.publishedPosts || 0);
          overview.scheduledPosts = Math.max(overview.scheduledPosts, firstPageData.overview.scheduledPosts || 0);
          if (firstPageData.overview.lastSync) {
            const syncMs = new Date(firstPageData.overview.lastSync).getTime();
            if (Number.isFinite(syncMs) && syncMs > latestSyncMs) {
              latestSyncMs = syncMs;
              overview.lastSync = firstPageData.overview.lastSync;
            }
          }
        }

        if (firstPosts.length === 0) return firstPosts;

        const totalForKey = firstPageData?.overview?.totalPosts || firstPosts.length;
        const totalPages = Math.ceil(totalForKey / PAGE_SIZE);

        if (totalPages <= 1) return firstPosts;

        // Step 2: Fetch remaining pages in parallel batches
        const keyPosts = [...firstPosts];
        const remainingPages: number[] = [];
        for (let p = 2; p <= totalPages; p++) {
          remainingPages.push(p);
        }

        for (let i = 0; i < remainingPages.length; i += PARALLEL_PAGES) {
          const batch = remainingPages.slice(i, i + PARALLEL_PAGES);
          const results = await Promise.allSettled(
            batch.map(page => fetchPage(apiKey, page))
          );
          for (const r of results) {
            if (r.status === 'fulfilled') {
              const posts = extractLateAnalyticsPosts(r.value);
              keyPosts.push(...posts);
            }
          }
        }

        return keyPosts;
      })
    );

    for (const result of keyResults) {
      if (result.status === 'fulfilled') {
        rawPosts.push(...(result.value || []));
      }
    }

    const normalizedPosts = rawPosts.map((post) => normalizeLateAnalyticsPost(post));
    const candidateExternalIds = new Set<string>();
    for (const post of normalizedPosts) {
      if (post._id) candidateExternalIds.add(post._id);
      for (const platform of post.platforms) {
        if (platform.platformPostId) candidateExternalIds.add(platform.platformPostId);
      }
    }

    let variableValuesByExternalId: Record<string, Record<string, string>> = {};
    let postVariableValuesByExternalId: Record<string, Record<string, string>> = {};
    let localFallbackPosts: Array<NormalizedLateAnalyticsPost & { variableValues: Record<string, string> }> = [];

    if (candidateExternalIds.size > 0) {
      try {
        await ensureDatabaseReady();
        variableValuesByExternalId = await getMediaVariableValuesByExternalIds([...candidateExternalIds]);
        postVariableValuesByExternalId = await getPostVariableValuesByExternalIds([...candidateExternalIds]);
      } catch (error) {
        console.error('Failed to load variable values for late analytics posts:', error);
      }
    }

    try {
      await ensureDatabaseReady();

      const localRows = await sql`
        SELECT
          p.id,
          p.job_id,
          p.late_account_id,
          p.caption,
          p.platform,
          p.published_at,
          p.external_post_id,
          p.late_post_id,
          p.platform_post_url,
          p.last_checked_at,
          p.created_at,
          p.updated_at,
          aa.username AS account_username,
          aa.display_name AS account_display_name
        FROM posts p
        LEFT JOIN LATERAL (
          SELECT
            a.username,
            a.display_name
          FROM analytics_accounts a
          WHERE a.late_account_id = p.late_account_id
            AND a.platform = p.platform
          ORDER BY a.last_synced_at DESC NULLS LAST, a.created_at DESC
          LIMIT 1
        ) aa ON TRUE
        WHERE p.status IN ('published', 'partial')
          AND (${platform || null}::text IS NULL OR p.platform = ${platform || null}::text)
          AND (${widenedFromBound || null}::timestamp IS NULL OR COALESCE(p.published_at, p.last_checked_at, p.updated_at, p.created_at) >= ${widenedFromBound || null}::timestamp)
          AND (${widenedToBound || null}::timestamp IS NULL OR COALESCE(p.published_at, p.last_checked_at, p.updated_at, p.created_at) <= ${widenedToBound || null}::timestamp)
        ORDER BY COALESCE(p.published_at, p.last_checked_at, p.updated_at, p.created_at) DESC
      ` as LocalLateAnalyticsDbRow[];

      const localJobIds = [...new Set(
        localRows
          .map((row) => row.job_id)
          .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      )];

      const jobVariableValuesByJobId = localJobIds.length > 0
        ? await getJobVariableValuesByTemplateJobIds(localJobIds)
        : {};

      // Build a map from all known post IDs → variable values (via job_id)
      // This serves as a robust fallback when external-ID-based lookups miss
      const jobVarMap = jobVariableValuesByJobId as Record<string, Record<string, string>>;
      for (const row of localRows) {
        if (!row.job_id || !jobVarMap[row.job_id]) continue;
        const vars = jobVarMap[row.job_id];
        if (Object.keys(vars).length === 0) continue;
        for (const alias of [row.late_post_id, row.external_post_id, row.id]) {
          if (alias && alias.trim()) {
            if (!postVariableValuesByExternalId[alias.trim()]) {
              postVariableValuesByExternalId[alias.trim()] = {};
            }
            Object.assign(postVariableValuesByExternalId[alias.trim()], vars);
          }
        }
      }

      localFallbackPosts = buildLateAnalyticsFallbackPosts({
        rows: localRows.map<LocalLateAnalyticsPostRow>((row) => ({
          id: row.id,
          jobId: row.job_id,
          lateAccountId: row.late_account_id,
          caption: row.caption,
          platform: row.platform,
          publishedAt: row.published_at,
          externalPostId: row.external_post_id,
          latePostId: row.late_post_id,
          platformPostUrl: row.platform_post_url,
          lastCheckedAt: row.last_checked_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          accountUsername: row.account_username,
          accountDisplayName: row.account_display_name,
        })),
        jobVariableValuesByJobId,
        existingExternalIds: candidateExternalIds,
        fromDate,
        toDate,
      });
    } catch (error) {
      console.error('Failed to load fallback local posts for late analytics:', error);
    }

    // Deduplicate posts by _id (safety net)
    const seenIds = new Set<string>();
    const allPosts: Array<NormalizedLateAnalyticsPost & { variableValues: Record<string, string> }> = [];
    for (const normalized of normalizedPosts) {
      const id = normalized._id;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);

      const variableValues: Record<string, string> = {};
      const matchingExternalIds = new Set<string>();
      if (normalized._id) matchingExternalIds.add(normalized._id);
      for (const platform of normalized.platforms) {
        if (platform.platformPostId) matchingExternalIds.add(platform.platformPostId);
      }
      for (const externalId of matchingExternalIds) {
        Object.assign(variableValues, variableValuesByExternalId[externalId] || {});
        Object.assign(variableValues, postVariableValuesByExternalId[externalId] || {});
      }

      allPosts.push({
        ...normalized,
        variableValues,
      });
    }

    const mergedPosts = [...allPosts, ...localFallbackPosts].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

    return NextResponse.json({ posts: mergedPosts, overview, total: mergedPosts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
