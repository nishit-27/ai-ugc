import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { getAllMediaItems } from '@/lib/db-analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || undefined;
    const accountId = searchParams.get('accountId') || undefined;
    const sortBy = searchParams.get('sortBy') || 'views';
    const limit = Number(searchParams.get('limit') || '50');
    const offset = Number(searchParams.get('offset') || '0');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (getAllMediaItems as any)({ platform, accountId, sortBy, order: 'desc', limit, offset });

    return NextResponse.json({
      items: items.map((m: Record<string, unknown>) => ({
        id: m.id,
        accountId: m.account_id,
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
        accountUsername: m.account_username,
        accountDisplayName: m.account_display_name,
      })),
    });
  } catch (error) {
    console.error('[analytics] media error:', error);
    return NextResponse.json({ error: 'Failed to fetch media items' }, { status: 500 });
  }
}
