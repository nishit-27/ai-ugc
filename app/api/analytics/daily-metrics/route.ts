import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getDailyMediaMetrics } from '@/lib/db-analytics';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '0');
    const data = await getDailyMediaMetrics(days);
    return NextResponse.json({ metrics: data });
  } catch (error) {
    console.error('[analytics] daily-metrics error:', error);
    return NextResponse.json({ error: 'Failed to fetch daily metrics' }, { status: 500 });
  }
}
