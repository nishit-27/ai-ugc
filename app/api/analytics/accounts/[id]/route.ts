import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAnalyticsAccount, deleteAnalyticsAccount, getMediaItemsByAccount, getAccountSnapshots } from '@/lib/db-analytics';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const account = await getAnalyticsAccount(id);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const [media, snapshots] = await Promise.all([
      getMediaItemsByAccount(id, 50),
      getAccountSnapshots(id, 30),
    ]);

    return NextResponse.json({
      account: {
        id: account.id,
        platform: account.platform,
        username: account.username,
        accountId: account.account_id,
        displayName: account.display_name,
        profileUrl: account.profile_url,
        followers: Number(account.followers),
        totalViews: Number(account.total_views),
        totalLikes: Number(account.total_likes),
        totalComments: Number(account.total_comments),
        totalShares: Number(account.total_shares),
        engagementRate: Number(account.engagement_rate),
        lastSyncedAt: account.last_synced_at,
        createdAt: account.created_at,
      },
      media: media.map((m: Record<string, unknown>) => ({
        id: m.id,
        platform: m.platform,
        externalId: m.external_id,
        title: m.title,
        caption: m.caption,
        url: m.url,
        thumbnailUrl: m.thumbnail_url,
        publishedAt: m.published_at,
        views: Number(m.views),
        likes: Number(m.likes),
        comments: Number(m.comments),
        shares: Number(m.shares),
        saves: Number(m.saves),
        engagementRate: Number(m.engagement_rate),
      })),
      snapshots: snapshots.map((s: Record<string, unknown>) => ({
        date: s.snapshot_date,
        followers: Number(s.followers),
        totalViews: Number(s.total_views),
        totalLikes: Number(s.total_likes),
        totalComments: Number(s.total_comments),
        totalShares: Number(s.total_shares),
        engagementRate: Number(s.engagement_rate),
      })),
    });
  } catch (error) {
    console.error('[analytics] GET account error:', error);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    await deleteAnalyticsAccount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[analytics] DELETE account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
