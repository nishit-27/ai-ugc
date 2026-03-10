import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';
import { getPostApiKeyIndex } from '@/lib/db-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function getKeyForPost(latePostId: string): Promise<string> {
  const index = await getPostApiKeyIndex(latePostId);
  if (index !== null) {
    return getApiKeyByIndex(index);
  }
  return config.LATE_API_KEYS[0];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const { platform } = body as { platform: string };

    if (!platform) {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    }

    const apiKey = await getKeyForPost(id);
    const data = await lateApiRequest(`/posts/${id}/unpublish`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
      apiKey,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = (error as Error).message || 'Failed to unpublish';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
