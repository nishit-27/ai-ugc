import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getPlatformBreakdown } from '@/lib/db-analytics';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '0');
    const data = await getPlatformBreakdown(days);
    return NextResponse.json({ platforms: data });
  } catch (error) {
    console.error('[analytics] platform-breakdown error:', error);
    return NextResponse.json({ error: 'Failed to fetch platform breakdown' }, { status: 500 });
  }
}
