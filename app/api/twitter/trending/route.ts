import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTrending } from '@/lib/twitter-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const trends = await getTrending();
    return NextResponse.json({ trends });
  } catch (error) {
    console.error('Twitter trending error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trends' },
      { status: 500 }
    );
  }
}
