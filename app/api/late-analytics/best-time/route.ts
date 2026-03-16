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
    const endpoint = `/analytics/best-time?${params.toString()}`;
    const results = await fetchFromAllKeys<any>(endpoint);

    // Merge time slot data: sum engagement values for the same day/hour
    const slotMap = new Map<string, any>();
    for (const { data } of results) {
      const slots = Array.isArray(data) ? data : data?.slots || data?.timeSlots || [];
      for (const slot of slots) {
        const key = `${slot.day ?? slot.dayOfWeek ?? ''}-${slot.hour ?? slot.time ?? ''}`;
        if (!slotMap.has(key)) {
          slotMap.set(key, {
            day: slot.day ?? slot.dayOfWeek,
            hour: slot.hour ?? slot.time,
            engagement: 0,
            impressions: 0,
            posts: 0,
          });
        }
        const existing = slotMap.get(key);
        existing.engagement += slot.engagement || 0;
        existing.impressions += slot.impressions || 0;
        existing.posts += slot.posts || 0;
      }
    }

    return NextResponse.json({ slots: Array.from(slotMap.values()) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
