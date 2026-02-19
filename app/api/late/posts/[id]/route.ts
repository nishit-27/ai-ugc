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
  // Fallback to first key for pre-migration data
  return config.LATE_API_KEYS[0];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const apiKey = await getKeyForPost(id);
    const data = await lateApiRequest<{ post?: unknown }>(`/posts/${id}`, { apiKey });
    return NextResponse.json({ post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, scheduledFor, timezone } = body as { content?: string; scheduledFor?: string; timezone?: string };
    const updateData: Record<string, string> = {};
    if (content !== undefined) updateData.content = content;
    if (scheduledFor !== undefined) updateData.scheduled_for = scheduledFor;
    if (timezone !== undefined) updateData.timezone = timezone;
    const apiKey = await getKeyForPost(id);
    const data = await lateApiRequest(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
      apiKey,
    });
    return NextResponse.json({ post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const apiKey = await getKeyForPost(id);
    await lateApiRequest(`/posts/${id}`, { method: 'DELETE', apiKey });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
