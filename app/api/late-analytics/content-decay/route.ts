import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['accountId', 'platform']) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const endpoint = `/analytics/content-decay?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    let allDecayData: any[] = [];
    for (const { data } of results) {
      const items = Array.isArray(data) ? data : data?.decay || data?.posts || [];
      allDecayData = allDecayData.concat(items);
    }

    return NextResponse.json({ decay: allDecayData });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
