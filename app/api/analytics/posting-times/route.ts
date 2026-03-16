import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getPostingTimesBucket } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '90');

    const postingTimes = await getPostingTimesBucket(days);

    return NextResponse.json({ postingTimes });
  } catch (error) {
    console.error('[analytics] posting-times error:', error);
    return NextResponse.json({ error: 'Failed to fetch posting times' }, { status: 500 });
  }
}
