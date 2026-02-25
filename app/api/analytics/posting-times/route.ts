import { NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db';
import { sql } from '@/lib/db-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '90');

    const condition = days > 0
      ? sql`AND published_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE - ${days}::INTEGER`
      : sql``;

    const rows = await sql`
      SELECT
        EXTRACT(DOW FROM published_at AT TIME ZONE 'Asia/Kolkata')::INT AS day_of_week,
        EXTRACT(HOUR FROM published_at AT TIME ZONE 'Asia/Kolkata')::INT AS hour,
        COUNT(*)::INT AS posts,
        COALESCE(SUM(views), 0)::BIGINT AS total_views,
        COALESCE(SUM(likes + comments + shares), 0)::BIGINT AS total_engagement
      FROM analytics_media_items
      WHERE published_at IS NOT NULL ${condition}
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour
    `;

    return NextResponse.json({
      postingTimes: rows.map((r: Record<string, unknown>) => ({
        dayOfWeek: Number(r.day_of_week),
        hour: Number(r.hour),
        posts: Number(r.posts),
        totalViews: Number(r.total_views),
        totalEngagement: Number(r.total_engagement),
      })),
    });
  } catch (error) {
    console.error('[analytics] posting-times error:', error);
    return NextResponse.json({ error: 'Failed to fetch posting times' }, { status: 500 });
  }
}
