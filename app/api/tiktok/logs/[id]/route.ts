import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type LogEntry = {
  _id: string;
  postId: string;
  platform: string;
  action: string;
  status: string;
  requestBody?: unknown;
  responseBody?: unknown;
  duration?: number;
  createdAt: string;
};

/**
 * GET /api/tiktok/logs/[id]
 * Fetch publishing logs for a post from the Late API.
 * The [id] param is the Late API post ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.LATE_API_KEYS[0]) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }

  try {
    const { id: latePostId } = await params;

    console.log(`[Post Logs] Fetching logs for Late post: ${latePostId}`);

    const data = await lateApiRequest<{ logs: LogEntry[] }>(`/posts/${latePostId}/logs`);

    return NextResponse.json({
      latePostId,
      logs: data.logs || [],
    });
  } catch (error) {
    console.error('[Post Logs] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
