import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const data = await lateApiRequest<{ post?: unknown }>(`/posts/${id}/retry`, { method: 'POST' });
    return NextResponse.json({ success: true, post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    console.error('Late API retry post error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
