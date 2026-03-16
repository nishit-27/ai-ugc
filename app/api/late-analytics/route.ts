import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/lateAccountPool';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 300;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseParams = new URLSearchParams();
    for (const key of ['accountId', 'platform', 'fromDate', 'toDate', 'sortBy', 'sortDirection']) {
      const val = searchParams.get(key);
      if (val) baseParams.set(key, val);
    }

    const keys = getApiKeys();
    let allPosts: any[] = [];
    const overview = {
      totalPosts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      lastSync: null as string | null,
    };

    // Fetch all pages from all keys in parallel
    const keyResults = await Promise.allSettled(
      keys.map(async (apiKey) => {
        const keyPosts: any[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const params = new URLSearchParams(baseParams);
          params.set('limit', String(PAGE_SIZE));
          params.set('offset', String(offset));
          const endpoint = `/analytics?${params.toString()}`;

          const data = await lateApiRequest<any>(endpoint, { apiKey });
          const posts = data?.posts || [];
          keyPosts.push(...posts);

          if (data?.overview) {
            // Only count overview from first page to avoid double-counting
            if (offset === 0) {
              overview.totalPosts += data.overview.totalPosts || 0;
              overview.publishedPosts += data.overview.publishedPosts || 0;
              overview.scheduledPosts += data.overview.scheduledPosts || 0;
              if (data.overview.lastSync) overview.lastSync = data.overview.lastSync;
            }
          }

          if (posts.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            offset += PAGE_SIZE;
          }
        }

        return keyPosts;
      })
    );

    for (const result of keyResults) {
      if (result.status === 'fulfilled') {
        allPosts = allPosts.concat(result.value);
      }
    }

    return NextResponse.json({ posts: allPosts, overview, total: allPosts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
