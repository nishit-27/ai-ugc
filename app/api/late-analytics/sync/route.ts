import { NextResponse, type NextRequest } from 'next/server';
import { syncLateAnalyticsToDb } from '@/lib/analytics/lateSync';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // no secret configured = allow (local dev)
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  return authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
}

/** Vercel cron entry point — runs the full Late-API → DB sync. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncLateAnalyticsToDb();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('[late-analytics-sync] cron failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manual trigger from the dashboard — requires a logged-in user. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncLateAnalyticsToDb();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('[late-analytics-sync] manual failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
