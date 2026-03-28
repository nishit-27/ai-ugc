import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { searchViralTweets } from '@/lib/twitter-api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  const minLikes = parseInt(searchParams.get('minLikes') || '100', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const tweets = await searchViralTweets(query, minLikes, limit);
    return NextResponse.json({ tweets });
  } catch (error) {
    console.error('Twitter search error:', error);
    return NextResponse.json(
      { error: 'Failed to search tweets' },
      { status: 500 }
    );
  }
}
