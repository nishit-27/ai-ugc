import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAllAnalyticsAccounts, touchAllAccountsSyncTime } from '@/lib/db-analytics';
import { syncAllAccounts, type SyncMode } from '@/lib/analytics/sync';
import { invalidatePivotCache } from '@/lib/pivot-cache';

export const dynamic = 'force-dynamic';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Allow long-running sync on serverless (Vercel Pro = 300s, Hobby = 60s)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const accounts = await getAllAnalyticsAccounts();

    // force=true bypasses the once-per-day guard
    const force = request.nextUrl.searchParams.get('force') === 'true';

    if (!force) {
      // Check if ALL accounts were synced within the last 24 hours
      const now = Date.now();
      const allFresh = accounts.length > 0 && accounts.every((a: { last_synced_at?: string }) => {
        if (!a.last_synced_at) return false;
        return now - new Date(a.last_synced_at).getTime() < TWENTY_FOUR_HOURS;
      });

      if (allFresh) {
        return NextResponse.json({
          skipped: true,
          message: 'All accounts were synced within the last 24 hours. Use force=true to override.',
          results: [],
        });
      }
    }

    // mode=light for incremental sync, default full for manual Hard Sync
    const mode = (request.nextUrl.searchParams.get('mode') as SyncMode) || 'full';

    console.log(`[analytics] Hard Sync (${mode}) for ${accounts.length} accounts`);
    const results = await syncAllAccounts(accounts, mode);
    const failed = results.filter((r: { success: boolean }) => !r.success);
    console.log(`[analytics] Hard Sync done: ${results.length - failed.length} ok, ${failed.length} failed`);
    if (failed.length > 0) {
      console.error('[analytics] Failed accounts:', JSON.stringify(failed));
    }
    // Always update last_synced_at for all accounts (even if some failed)
    await touchAllAccountsSyncTime();
    // Invalidate pivot cache so Variable Tracking picks up fresh data
    invalidatePivotCache();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[analytics] Hard Sync error:', error);
    return NextResponse.json({ error: 'Failed to sync accounts' }, { status: 500 });
  }
}
