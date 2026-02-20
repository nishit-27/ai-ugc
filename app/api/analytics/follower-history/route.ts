import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getFollowerHistory } from '@/lib/db-analytics';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '0');
    const rows = await getFollowerHistory(days);
    const history = rows.map((r: Record<string, unknown>) => ({
      date: String(r.date).trim(),
      followers: Number(r.followers),
    }));
    return NextResponse.json({ history });
  } catch (error) {
    console.error('[analytics] follower-history error:', error);
    return NextResponse.json({ error: 'Failed to fetch follower history' }, { status: 500 });
  }
}
