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
    const data = await lateApiRequest<{ profile?: unknown }>(`/profiles/${id}`);
    return NextResponse.json({ profile: (data as { profile?: unknown }).profile ?? data });
  } catch (error) {
    console.error('Late API get profile error:', error);
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
    const { name, description, color } = body as { name?: string; description?: string; color?: string };
    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    const data = await lateApiRequest(`/profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    return NextResponse.json({ profile: (data as { profile?: unknown }).profile ?? data });
  } catch (error) {
    console.error('Late API update profile error:', error);
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
    await lateApiRequest(`/profiles/${id}`, { method: 'DELETE' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Late API delete profile error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
