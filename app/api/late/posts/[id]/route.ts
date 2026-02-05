import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const data = await lateApiRequest<{ post?: unknown }>(`/posts/${id}`);
    return NextResponse.json({ post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    console.error('Late API get post error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, scheduledFor, timezone } = body as { content?: string; scheduledFor?: string; timezone?: string };
    const updateData: Record<string, string> = {};
    if (content !== undefined) updateData.content = content;
    if (scheduledFor !== undefined) updateData.scheduled_for = scheduledFor;
    if (timezone !== undefined) updateData.timezone = timezone;
    const data = await lateApiRequest(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    return NextResponse.json({ post: (data as { post?: unknown }).post ?? data });
  } catch (error) {
    console.error('Late API update post error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEY) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    await lateApiRequest(`/posts/${id}`, { method: 'DELETE' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Late API delete post error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
