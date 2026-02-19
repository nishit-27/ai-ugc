import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';
import { getPostApiKeyIndex } from '@/lib/db-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const index = await getPostApiKeyIndex(id);
    const apiKey = index !== null ? getApiKeyByIndex(index) : config.LATE_API_KEYS[0];
    const data = await lateApiRequest<{ post?: unknown }>(`/posts/${id}/retry`, { method: 'POST', apiKey });
    return NextResponse.json({ success: true, post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
