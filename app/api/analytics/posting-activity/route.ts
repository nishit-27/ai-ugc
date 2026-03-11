import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getPostingActivity } from '@/lib/db-analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '0');
    const unique = searchParams.get('unique') === '1';
    const data = await getPostingActivity(days, unique);
    console.log('[analytics] posting-activity response:', JSON.stringify({ days, entries: data.postingActivity?.length, totalVideos: data.totalVideos, sample: data.postingActivity?.slice(0, 3) }));
    return NextResponse.json(data);
  } catch (error) {
    console.error('[analytics] posting-activity error:', error);
    return NextResponse.json({ error: 'Failed to fetch posting activity' }, { status: 500 });
  }
}
