import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getApiKeyForProfile, getAccountLabel } from '@/lib/lateAccountPool';
import { deleteProfileApiKey } from '@/lib/db-late-profile-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function resolveKeyForProfile(id: string) {
  const resolved = await getApiKeyForProfile(id);
  if (resolved) return resolved;
  // Fallback to first key for pre-migration data
  return { apiKey: config.LATE_API_KEYS[0], apiKeyIndex: 0 };
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
    const keyInfo = await resolveKeyForProfile(id);
    const data = await lateApiRequest<{ profile?: unknown }>(`/profiles/${id}`, { apiKey: keyInfo.apiKey });
    const profile = (data as { profile?: unknown }).profile ?? data;
    return NextResponse.json({
      profile: { ...(profile as object), apiKeyIndex: keyInfo.apiKeyIndex, accountLabel: getAccountLabel(keyInfo.apiKeyIndex) },
    });
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
    const { name, description, color } = body as { name?: string; description?: string; color?: string };
    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;

    const keyInfo = await resolveKeyForProfile(id);
    const data = await lateApiRequest(`/profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
      apiKey: keyInfo.apiKey,
    });
    const profile = (data as { profile?: unknown }).profile ?? data;
    return NextResponse.json({
      profile: { ...(profile as object), apiKeyIndex: keyInfo.apiKeyIndex, accountLabel: getAccountLabel(keyInfo.apiKeyIndex) },
    });
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
    const keyInfo = await resolveKeyForProfile(id);
    await lateApiRequest(`/profiles/${id}`, { method: 'DELETE', apiKey: keyInfo.apiKey });
    await deleteProfileApiKey(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
