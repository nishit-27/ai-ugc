import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['accountId', 'platform', 'fromDate', 'toDate', 'limit', 'offset', 'sortBy', 'sortDirection']) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const endpoint = `/analytics?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    let allPosts: any[] = [];
    const overview = {
      totalPosts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      lastSync: null as string | null,
    };

    for (const { data } of results) {
      if (data?.posts) allPosts = allPosts.concat(data.posts);
      if (data?.overview) {
        overview.totalPosts += data.overview.totalPosts || 0;
        overview.publishedPosts += data.overview.publishedPosts || 0;
        overview.scheduledPosts += data.overview.scheduledPosts || 0;
        if (data.overview.lastSync) overview.lastSync = data.overview.lastSync;
      }
    }

    // Pass through raw posts — the hook handles normalization
    return NextResponse.json({ posts: allPosts, overview, total: allPosts.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
