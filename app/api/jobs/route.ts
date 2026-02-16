import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json(jobs, {
      headers: { 'Cache-Control': 'private, max-age=2, stale-while-revalidate=15' },
    });
  } catch (err) {
    console.error('Get jobs error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
