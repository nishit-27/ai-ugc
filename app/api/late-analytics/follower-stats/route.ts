import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    const accountId = searchParams.get('accountId');
    if (accountId) params.set('accountId', accountId);

    const endpoint = `/accounts/follower-stats?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    let allStats: any[] = [];
    for (const { data } of results) {
      const items = data?.accounts || (Array.isArray(data) ? data : []);
      allStats = allStats.concat(items);
    }

    // Deduplicate by _id or accountId
    const seen = new Set<string>();
    const deduped = allStats.filter((item) => {
      const id = item._id || item.accountId || item.id;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return NextResponse.json({ accounts: deduped });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
