import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAnalyticsOverview } from '@/lib/db-analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '30');
    const overview = await getAnalyticsOverview(days);
    return NextResponse.json(overview);
  } catch (error) {
    console.error('[analytics] overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch overview' }, { status: 500 });
  }
}
