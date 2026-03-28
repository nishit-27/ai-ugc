import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchTweetByUrl } from '@/lib/twitter-api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    const tweet = await fetchTweetByUrl(url);
    if (!tweet) {
      return NextResponse.json({ error: 'Tweet not found' }, { status: 404 });
    }
    return NextResponse.json({ tweet });
  } catch (error) {
    console.error('Fetch tweet error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tweet' },
      { status: 500 }
    );
  }
}
