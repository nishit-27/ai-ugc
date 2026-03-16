import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/lateAccountPool';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GetLate API returns max 100 per page, uses page-based (not offset-based) pagination
const PAGE_SIZE = 100;
const PARALLEL_PAGES = 20;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseParams = new URLSearchParams();
    for (const key of ['accountId', 'platform', 'fromDate', 'toDate', 'sortBy', 'sortDirection']) {
      const val = searchParams.get(key);
      if (val) baseParams.set(key, val);
    }

    const keys = getApiKeys();
    const rawPosts: any[] = [];
    const overview = {
      totalPosts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      lastSync: null as string | null,
    };
    let latestSyncMs = 0;

    const fetchPage = async (apiKey: string, page: number) => {
      const params = new URLSearchParams(baseParams);
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      return lateApiRequest<any>(`/analytics?${params.toString()}`, { apiKey });
    };

    // Fetch all keys in parallel
    const keyResults = await Promise.allSettled(
      keys.map(async (apiKey) => {
        // Step 1: Fetch first page to get totalPosts count
        const firstPage = await fetchPage(apiKey, 1);
        const firstPosts = firstPage?.posts || [];

        if (firstPage?.overview) {
          overview.totalPosts = Math.max(overview.totalPosts, firstPage.overview.totalPosts || 0);
          overview.publishedPosts = Math.max(overview.publishedPosts, firstPage.overview.publishedPosts || 0);
          overview.scheduledPosts = Math.max(overview.scheduledPosts, firstPage.overview.scheduledPosts || 0);
          if (firstPage.overview.lastSync) {
            const syncMs = new Date(firstPage.overview.lastSync).getTime();
            if (Number.isFinite(syncMs) && syncMs > latestSyncMs) {
              latestSyncMs = syncMs;
              overview.lastSync = firstPage.overview.lastSync;
            }
          }
        }

        if (firstPosts.length === 0) return firstPosts;

        const totalForKey = firstPage?.overview?.totalPosts || firstPosts.length;
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
              const posts = r.value?.posts || [];
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
    const allPosts: any[] = [];
    for (const post of rawPosts) {
      const id = post._id || post.latePostId || '';
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      allPosts.push(post);
    }

    return NextResponse.json({ posts: allPosts, overview, total: allPosts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
