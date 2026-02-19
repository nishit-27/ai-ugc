import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const { id } = await params;
    // Client passes apiKeyIndex so we route directly to the correct key
    const indexParam = request.nextUrl.searchParams.get('apiKeyIndex');
    const apiKeyIndex = indexParam !== null ? parseInt(indexParam, 10) : 0;
    const apiKey = getApiKeyByIndex(apiKeyIndex);
    await lateApiRequest(`/accounts/${id}`, { method: 'DELETE', apiKey });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
