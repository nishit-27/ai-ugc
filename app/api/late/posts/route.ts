import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const { status, platform, limit = '50' } = Object.fromEntries(request.nextUrl.searchParams);
    let endpoint = `/posts?limit=${limit}`;
    if (status) endpoint += `&status=${status}`;
    const data = (await lateApiRequest<{ posts?: unknown[] }>(endpoint)) as { posts?: { platforms?: { platform: string; status?: string }[] }[] };
    let posts = data.posts || [];
    if (platform) {
      posts = posts.filter((post) =>
        post.platforms?.some((p: { platform: string }) => p.platform === platform)
      );
    }
    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Late API posts error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
