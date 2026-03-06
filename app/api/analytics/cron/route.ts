import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAllAnalyticsAccounts } from '@/lib/db-analytics';
import { syncAllAccounts } from '@/lib/analytics/sync';

export const dynamic = 'force-dynamic';

/**
 * Daily analytics sync — called at 6 AM IST (00:30 UTC) via cron.
 * Uses 'light' mode by default: incremental fetch, skips stale accounts,
 * caps metric snapshots to 60 days. Pass ?mode=full for a complete sync.
 *
 * Cron config (external service or Vercel):
 *   Schedule: "30 0 * * *" (00:30 UTC = 6:00 AM IST)
 *   URL: /api/analytics/cron?secret=CRON_SECRET
 */
export async function GET(request: NextRequest) {
  // Verify cron secret — supports Vercel's Authorization header and manual ?secret= param
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const querySecret = request.nextUrl.searchParams.get('secret');
    const authorized = authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    await ensureDatabaseReady();
    const accounts = await getAllAnalyticsAccounts();

    if (accounts.length === 0) {
      return NextResponse.json({ message: 'No accounts to sync', results: [] });
    }

    // 'light' for daily (incremental), 'full' via ?mode=full for weekly
    const mode = (request.nextUrl.searchParams.get('mode') === 'full') ? 'full' as const : 'light' as const;

    console.log(`[analytics-cron] Starting ${mode} sync for ${accounts.length} accounts at ${new Date().toISOString()}`);
    const startTime = Date.now();

    const results = await syncAllAccounts(accounts, mode);

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
