import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json(jobs);
  } catch (err) {
    console.error('Get jobs error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
