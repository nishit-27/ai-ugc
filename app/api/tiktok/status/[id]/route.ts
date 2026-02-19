import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { getPostByLateId, updatePostByLateId } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type LatePostPlatform = {
  platform: string;
  status?: string;
  publishedAt?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
};

type LatePost = {
  _id: string;
  status: string;
  publishedAt?: string;
  platforms?: LatePostPlatform[];
};

/**
 * GET /api/tiktok/status/[id]
 * Check the publish status of a post by its Late API post ID.
 * Updates the local DB with the latest status from Late API.
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

    console.log(`[Post Status] Checking status for Late post: ${latePostId}`);

    // Fetch latest status from Late API
    const data = await lateApiRequest<{ post: LatePost }>(`/posts/${latePostId}`);
    const latePost = data.post;

    if (!latePost) {
      return NextResponse.json({ error: 'Post not found in Late API' }, { status: 404 });
    }

    // Extract TikTok platform status
    const tiktokPlatform = latePost.platforms?.find((p) => p.platform === 'tiktok');
    const platformStatus = tiktokPlatform?.status || latePost.status;
    const platformPostUrl = tiktokPlatform?.platformPostUrl || null;
    const platformPostId = tiktokPlatform?.platformPostId || null;
    const platformError = tiktokPlatform?.error || null;

    // Map Late API status to our DB status
    let dbStatus: string;
    if (platformStatus === 'published') {
      dbStatus = 'published';
    } else if (latePost.status === 'scheduled') {
      dbStatus = 'scheduled';
    } else if (platformStatus === 'failed') {
      dbStatus = 'failed';
    } else if (platformStatus === 'partial') {
      dbStatus = 'partial';
    } else if (platformStatus === 'cancelled') {
      dbStatus = 'cancelled';
    } else {
      dbStatus = 'publishing';
    }

    // Update local DB
    const localPost = await getPostByLateId(latePostId);
    if (localPost) {
      const updates: Record<string, unknown> = {
        status: dbStatus,
        lastCheckedAt: new Date().toISOString(),
      };

      if (platformPostUrl) updates.platformPostUrl = platformPostUrl;
      if (platformPostId) updates.externalPostId = platformPostId;
      if (dbStatus === 'published') {
        updates.publishedAt = tiktokPlatform?.publishedAt || latePost.publishedAt || new Date().toISOString();
      }
      if (dbStatus === 'failed' && platformError) {
        updates.error = typeof platformError === 'string' ? platformError : JSON.stringify(platformError);
      }

      await updatePostByLateId(latePostId, updates);
      console.log(`[Post Status] Updated local DB: ${dbStatus}`);
    }

    return NextResponse.json({
      latePostId,
      status: dbStatus,
      lateStatus: latePost.status,
      platformStatus,
      platformPostUrl,
      platformPostId,
      error: platformError,
      localPostId: localPost?.id || null,
      publishedAt: tiktokPlatform?.publishedAt || latePost.publishedAt || null,
    });
  } catch (error) {
    console.error('[Post Status] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
