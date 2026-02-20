import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAllAnalyticsAccounts } from '@/lib/db-analytics';
import { syncAllAccounts } from '@/lib/analytics/sync';

/**
 * Daily analytics sync — called at 6 AM IST (00:30 UTC) via cron.
 * Syncs ALL accounts, ALL videos (old + new), full data.
 *
 * Can also be triggered manually via GET /api/analytics/cron?secret=CRON_SECRET
 *
 * Cron config (external service or Vercel):
 *   Schedule: "30 0 * * *" (00:30 UTC = 6:00 AM IST)
 *   URL: /api/analytics/cron?secret=CRON_SECRET
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const secret = request.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabaseReady();
    const accounts = await getAllAnalyticsAccounts();

    if (accounts.length === 0) {
      return NextResponse.json({ message: 'No accounts to sync', results: [] });
    }

    console.log(`[analytics-cron] Starting daily sync for ${accounts.length} accounts at ${new Date().toISOString()}`);
    const startTime = Date.now();

    const results = await syncAllAccounts(accounts);

    const failed = results.filter((r: { success: boolean }) => !r.success);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[analytics-cron] Done in ${duration}s: ${results.length - failed.length} ok, ${failed.length} failed`);
    if (failed.length > 0) {
      console.error('[analytics-cron] Failed:', JSON.stringify(failed));
    }

    return NextResponse.json({
      message: `Synced ${results.length} accounts in ${duration}s`,
      total: results.length,
      success: results.length - failed.length,
      failed: failed.length,
      failedAccounts: failed,
    });
  } catch (error) {
    console.error('[analytics-cron] Error:', error);
    return NextResponse.json({ error: 'Cron sync failed' }, { status: 500 });
  }
}

// Max duration for serverless (Vercel Pro = 300s, Hobby = 60s)
export const maxDuration = 300;
