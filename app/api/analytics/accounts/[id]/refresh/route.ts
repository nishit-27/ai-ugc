import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAnalyticsAccount } from '@/lib/db-analytics';
import { syncAccount } from '@/lib/analytics/sync';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const account = await getAnalyticsAccount(id);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const result = await syncAccount(account);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[analytics] refresh account error:', error);
    return NextResponse.json({ error: 'Failed to refresh account' }, { status: 500 });
  }
}
