import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/lateAccountPool';
import { lateApiRequest } from '@/lib/lateApi';
import {
  extractLateAnalyticsPosts,
  normalizeLateAnalyticsListParams,
  normalizeLateAnalyticsPost,
} from '@/lib/late-analytics-normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GetLate API returns max 100 per page, uses page-based (not offset-based) pagination
const PAGE_SIZE = 100;
const PARALLEL_PAGES = 20;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseParams = normalizeLateAnalyticsListParams(searchParams);

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

    // Deduplicate posts by _id (safety net)
    const seenIds = new Set<string>();
    const allPosts: ReturnType<typeof extractLateAnalyticsPosts> = [];
    for (const post of rawPosts) {
      const normalized = normalizeLateAnalyticsPost(post);
      const id = normalized._id;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      allPosts.push(normalized);
    }

    return NextResponse.json({ posts: allPosts, overview, total: allPosts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
