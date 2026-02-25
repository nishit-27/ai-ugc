import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAllAnalyticsAccounts, createAnalyticsAccount } from '@/lib/db-analytics';
import { syncAccount } from '@/lib/analytics/sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabaseReady();
    const accounts = await getAllAnalyticsAccounts();
    return NextResponse.json({
      accounts: accounts.map((a: Record<string, unknown>) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
        accountId: a.account_id,
        displayName: a.display_name,
        profileUrl: a.profile_url,
        lateAccountId: a.late_account_id,
        followers: Number(a.followers),
        totalViews: Number(a.total_views),
        totalLikes: Number(a.total_likes),
        totalComments: Number(a.total_comments),
        totalShares: Number(a.total_shares),
        engagementRate: Number(a.engagement_rate),
        lastSyncedAt: a.last_synced_at,
        mediaCount: Number(a.media_count || 0),
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('[analytics] GET accounts error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics accounts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { platform, username, lateAccountId } = body;

    if (!platform || !username) {
      return NextResponse.json({ error: 'platform and username are required' }, { status: 400 });
    }

    if (!['instagram', 'tiktok', 'youtube'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be instagram, tiktok, or youtube' }, { status: 400 });
    }

    // Create or get existing account
    const account = await createAnalyticsAccount({
      platform,
      username: username.replace(/^@/, ''),
      accountId: null,
      displayName: null,
      profileUrl: null,
      lateAccountId: lateAccountId || null,
      followers: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      engagementRate: 0,
      metadata: null,
    });

    // Trigger initial sync
    const syncResult = await syncAccount(account);

    // Re-fetch with updated stats
    const accounts = await getAllAnalyticsAccounts();
    const updated = accounts.find((a: { id: string }) => a.id === account.id);

    return NextResponse.json({
      account: updated ? {
        id: updated.id,
        platform: updated.platform,
        username: updated.username,
        accountId: updated.account_id,
        displayName: updated.display_name,
        profileUrl: updated.profile_url,
        followers: Number(updated.followers),
        totalViews: Number(updated.total_views),
        totalLikes: Number(updated.total_likes),
        totalComments: Number(updated.total_comments),
        totalShares: Number(updated.total_shares),
        engagementRate: Number(updated.engagement_rate),
        lastSyncedAt: updated.last_synced_at,
        mediaCount: Number(updated.media_count || 0),
        createdAt: updated.created_at,
      } : account,
      syncResult,
    });
  } catch (error) {
    console.error('[analytics] POST accounts error:', error);
    const message = error instanceof Error ? error.message : 'Failed to add account';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
