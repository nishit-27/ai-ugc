import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['accountId', 'platform', 'fromDate', 'toDate']) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const endpoint = `/analytics/posting-frequency?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    let allFrequencyData: any[] = [];
    for (const { data } of results) {
      const items = Array.isArray(data) ? data : data?.frequency || data?.data || [];
      allFrequencyData = allFrequencyData.concat(items);
    }

    return NextResponse.json({ frequency: allFrequencyData });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
