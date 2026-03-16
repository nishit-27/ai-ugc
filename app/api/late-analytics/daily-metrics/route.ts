import { NextResponse } from 'next/server';
import { fetchFromAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ['accountId', 'fromDate', 'toDate']) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const endpoint = `/analytics/daily-metrics?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    const dayMap = new Map<string, any>();
    for (const { data } of results) {
      const days = data?.dailyData || [];
      for (const day of days) {
        const existing = dayMap.get(day.date);
        if (!existing) {
          dayMap.set(day.date, JSON.parse(JSON.stringify(day)));
        } else {
          existing.postCount += day.postCount || 0;
          // Merge metrics (the actual API uses "metrics" not "totals")
          if (day.metrics) {
            if (!existing.metrics) existing.metrics = {};
            for (const [k, v] of Object.entries(day.metrics)) {
              existing.metrics[k] = (existing.metrics[k] || 0) + ((v as number) || 0);
            }
          }
          // Merge platforms (Record<string, number> of post counts)
          if (day.platforms) {
            if (!existing.platforms) existing.platforms = {};
            for (const [platform, count] of Object.entries(day.platforms)) {
              existing.platforms[platform] = (existing.platforms[platform] || 0) + ((count as number) || 0);
            }
          }
        }
      }
    }

    const dailyData = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ dailyData });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
