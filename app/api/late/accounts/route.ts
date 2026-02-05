import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const data = (await lateApiRequest<{ accounts?: unknown[] }>('/accounts')) as { accounts?: unknown[] };
    return NextResponse.json({ accounts: data.accounts || [] });
  } catch (error) {
    console.error('Late API accounts error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
