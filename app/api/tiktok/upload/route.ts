import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createHash } from 'crypto';
import { config } from '@/lib/config';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { downloadToBuffer } from '@/lib/storage';
import { createPost, updatePost, findRecentDuplicatePost, beginPostIdempotency, completePostIdempotency, clearPostIdempotency } from '@/lib/db';
import { auth } from '@/lib/auth';

// Allow longer timeout for video uploads (3 minutes)
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

// Late API response types
type PresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  key?: string;
  type?: string;
};

type LatePostPlatform = {
  platform: string;
  accountId: string | { _id: string };
  status?: string;
  publishedAt?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
};

type LatePost = {
  _id: string;
  content?: string;
  status: string;
  scheduledFor?: string;
  publishedAt?: string;
  platforms?: LatePostPlatform[];
  mediaItems?: { type: string; url: string }[];
};

type CreatePostResponse = {
  post: LatePost;
  message?: string;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `tiktok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let idempotencyKey: string | null = null;
  let idempotencyAcquired = false;

  const log = (stage: string, ...args: unknown[]) => {
    console.log(`[TikTok Upload][${requestId}][${stage}]`, ...args);
  };
  const logError = (stage: string, ...args: unknown[]) => {
    console.error(`[TikTok Upload][${requestId}][${stage}]`, ...args);
  };

  log('START', 'Request received');

  try {
    const body = await request.json();
    const {
      videoPath,
      videoUrl,
      caption,
      accountId,
      scheduledFor,
      timezone,
      publishNow,
      jobId,
      forceRepost,
      forceToken,
    } = body as {
      videoPath?: string;
      videoUrl?: string;
      caption?: string;
      accountId?: string;
      scheduledFor?: string;
      timezone?: string;
      publishNow?: boolean;
      jobId?: string;
      forceRepost?: boolean;
      forceToken?: string;
    };

    log('PARSE', 'Parsed request body', {
      hasVideoUrl: !!videoUrl,
      hasVideoPath: !!videoPath,
      captionLength: caption?.length || 0,
      accountId: accountId?.slice(0, 10) + '...',
      publishNow,
      scheduledFor: scheduledFor || 'none',
      timezone: timezone || config.defaultTimezone,
    });

    // --- Validation ---
    if (!config.LATE_API_KEY) {
      logError('VALIDATE', 'LATE_API_KEY not configured');
      return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
    }

    const finalVideoUrl = videoUrl || videoPath;
    if (!finalVideoUrl) {
      logError('VALIDATE', 'No video URL provided');
      return NextResponse.json({ error: 'Video URL is required (videoUrl or videoPath)' }, { status: 400 });
    }
    if (!accountId) {
      logError('VALIDATE', 'No account ID provided');
      return NextResponse.json({ error: 'TikTok account ID is required' }, { status: 400 });
    }

    // Determine publish mode
    const isImmediate = publishNow || !scheduledFor;
    const mode = isImmediate ? 'immediate' : 'scheduled';
    const isForceRepost = !!forceRepost;
    const normalizedForceToken = typeof forceToken === 'string' && forceToken.trim() ? forceToken.trim() : null;
    if (isForceRepost && !normalizedForceToken) {
      logError('VALIDATE', 'forceRepost requires forceToken');
      return NextResponse.json({ error: 'forceToken is required when forceRepost is true' }, { status: 400 });
    }
    log('MODE', `Publish mode: ${mode}${isForceRepost ? ' (force repost)' : ''}`);

    const lockFingerprint = createHash('sha256')
      .update(JSON.stringify({
        videoUrl: finalVideoUrl,
        caption: caption || '',
        accountId,
        mode: isImmediate ? 'now' : 'schedule',
        scheduledFor: isImmediate ? null : (scheduledFor || null),
        timezone: timezone || config.defaultTimezone,
      }))
      .digest('hex');
    const idempotencyRequestHash = isForceRepost
      ? createHash('sha256').update(`${lockFingerprint}:${normalizedForceToken}`).digest('hex')
      : lockFingerprint;
    idempotencyKey = isForceRepost
      ? `tiktok-upload:force:${normalizedForceToken}`
      : `tiktok-upload:${lockFingerprint}`;

    const idemState = await beginPostIdempotency({
      key: idempotencyKey,
      requestHash: idempotencyRequestHash,
    });
    if (idemState.state === 'processing') {
      log('DEDUPE', 'Suppressing duplicate request due to persistent idempotency lock');
      return NextResponse.json({
        success: true,
        deduped: true,
        message: 'Identical post request is already being processed.',
      });
    }
    if (idemState.state === 'completed') {
      log('DEDUPE', `Suppressing duplicate request from persistent idempotency record: ${idempotencyKey}`);
      const savedResponse = idemState.response && typeof idemState.response === 'object'
        ? idemState.response as Record<string, unknown>
        : null;
      const latePostId = idemState.latePostId || (savedResponse?.post as { latePostId?: string } | undefined)?.latePostId;
      return NextResponse.json({
        success: true,
        ...(savedResponse || {}),
        deduped: true,
        message: 'Duplicate request suppressed. This post was already created.',
        post: (savedResponse?.post as Record<string, unknown> | undefined) || {
          latePostId: latePostId || null,
          platforms: [],
        },
      });
    }
    if (idemState.state === 'mismatch') {
      logError('DEDUPE', `Idempotency key collision with mismatched payload: ${idempotencyKey}`);
      return NextResponse.json(
        { error: 'Idempotency key already used with different request payload' },
        { status: 409 },
      );
    }
    idempotencyAcquired = true;

    if (!isForceRepost) {
      try {
        const recentDuplicate = await findRecentDuplicatePost({
          caption: caption || '',
          videoUrl: finalVideoUrl,
          lateAccountIds: [accountId],
          mode: isImmediate ? 'now' : 'schedule',
          scheduledFor: isImmediate ? null : (scheduledFor || null),
          withinSeconds: 30,
        });
        if (recentDuplicate?.latePostId) {
          log('DEDUPE', `Suppressing duplicate using DB match: ${recentDuplicate.latePostId}`);
          const duplicatePayload = {
            success: true,
            deduped: true,
            message: 'Duplicate request suppressed. A matching post was already created.',
            post: {
              latePostId: recentDuplicate.latePostId,
              platforms: [],
            },
          };
          if (idempotencyAcquired && idempotencyKey) {
            await completePostIdempotency({
              key: idempotencyKey,
              latePostId: recentDuplicate.latePostId,
              response: duplicatePayload,
            });
          }
          return NextResponse.json(duplicatePayload);
        }
      } catch (dedupeError) {
        logError('DEDUPE', 'Recent duplicate DB check failed:', (dedupeError as Error).message);
      }
    }

    // --- Step 1: Get presigned upload URL from Late API ---
    log('PRESIGN', 'Requesting presigned URL from Late API...');
    const filename = path.basename(finalVideoUrl.split('?')[0]); // Strip query params
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.mov' ? 'video/quicktime' :
      ext === '.webm' ? 'video/webm' :
      'video/mp4';

    const presignData = await lateApiRequest<PresignResponse>('/media/presign', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType }),
    });

    log('PRESIGN', 'Got presigned URL', {
      publicUrl: presignData.publicUrl,
      type: presignData.type,
    });

    // --- Step 2: Download video and upload to Late API storage ---
    log('DOWNLOAD', `Downloading video from: ${finalVideoUrl.slice(0, 80)}...`);
    const downloadStart = Date.now();

    let fileBuffer: Buffer;
    if (finalVideoUrl.startsWith('https://storage.googleapis.com')) {
      fileBuffer = await downloadToBuffer(finalVideoUrl);
    } else {
      const response = await fetch(finalVideoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    }

    const downloadMs = Date.now() - downloadStart;
    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
    log('DOWNLOAD', `Downloaded ${fileSizeMB}MB in ${downloadMs}ms`);

    log('UPLOAD', `Uploading ${fileSizeMB}MB to Late API storage...`);
    const uploadStart = Date.now();

    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 120000); // 2 min timeout

    try {
      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileBuffer.length),
        },
        body: new Uint8Array(fileBuffer),
        signal: uploadController.signal,
      });

      clearTimeout(uploadTimeout);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logError('UPLOAD', `Upload failed: ${uploadResponse.status}`, errorText);
        throw new Error(`File upload to Late storage failed: ${uploadResponse.status} - ${errorText}`);
      }

      const uploadMs = Date.now() - uploadStart;
      log('UPLOAD', `Upload complete in ${uploadMs}ms`);
    } catch (uploadErr) {
      clearTimeout(uploadTimeout);
      if (uploadErr instanceof Error && uploadErr.name === 'AbortError') {
        logError('UPLOAD', 'Upload timed out after 120s');
        throw new Error('Video upload timed out. The file may be too large or the network is slow.');
      }
      throw uploadErr;
    }

    // Brief wait for Late API to process the upload
    log('WAIT', 'Waiting 2s for Late API to process upload...');
    await new Promise((r) => setTimeout(r, 2000));

    // --- Step 3: Create post via Late API ---
    log('POST', 'Creating post via Late API...');

    // Build post body using CORRECT flat TikTokPlatformData format (not deprecated nested tiktokSettings)
    const postBody: Record<string, unknown> = {
      content: caption || '',
      mediaItems: [{ type: 'video', url: presignData.publicUrl }],
      platforms: [
        {
          platform: 'tiktok',
          accountId,
          platformSpecificData: {
            // Flat TikTokPlatformData properties (NOT deprecated nested tiktokSettings)
            privacyLevel: 'PUBLIC_TO_EVERYONE',
            allowComment: true,
            allowDuet: true,
            allowStitch: true,
            contentPreviewConfirmed: true,
            expressConsentGiven: true,
            videoMadeWithAi: false,
            videoCoverTimestampMs: 1000, // Default cover at 1 second
          },
        },
      ],
    };

    // Set publish timing
    if (isImmediate) {
      postBody.publishNow = true;
      log('POST', 'Publishing immediately');
    } else {
      postBody.scheduledFor = scheduledFor;
      postBody.timezone = timezone || config.defaultTimezone;
      postBody.publishNow = false;
      log('POST', `Scheduling for ${scheduledFor} (${postBody.timezone})`);
    }

    log('POST', 'Request body:', JSON.stringify(postBody, null, 2));

    const postData = await lateApiRequest<CreatePostResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify(postBody),
      timeout: 60000, // 60s timeout for post creation
    });

    const latePost = postData.post;
    const latePostId = latePost._id;
    log('POST', `Post created: ${latePostId}, status: ${latePost.status}`);

    // Extract platform results from response
    const tiktokPlatform = latePost.platforms?.find((p) => p.platform === 'tiktok');
    const platformStatus = tiktokPlatform?.status || latePost.status;
    const platformPostUrl = tiktokPlatform?.platformPostUrl || null;
    const platformPostId = tiktokPlatform?.platformPostId || null;

    log('POST', 'Platform result:', {
      platformStatus,
      platformPostUrl,
      platformPostId,
    });

    // --- Step 4: Map Late API status to our DB status ---
    let dbStatus: string;
    if (platformStatus === 'published') {
      dbStatus = 'published';
    } else if (latePost.status === 'scheduled') {
      dbStatus = 'scheduled';
    } else if (platformStatus === 'failed') {
      dbStatus = 'failed';
    } else if (platformStatus === 'partial') {
      dbStatus = 'partial';
    } else {
      // pending, publishing, processing, etc.
      dbStatus = isImmediate ? 'publishing' : 'scheduled';
    }

    // --- Step 5: Store post in our database ---
    log('DB', `Saving post to database with status: ${dbStatus}`);

    let dbPost: Awaited<ReturnType<typeof createPost>> | null = null;
    let dbWarning: string | undefined;
    try {
      const session = await auth();
      const createdBy = session?.user?.name?.split(' ')[0] || null;
      dbPost = await createPost({
        jobId: jobId || null,
        accountId: null, // Don't use Late account ID as local FK
        lateAccountId: accountId, // Store Late API account ID separately
        caption: caption || '',
        videoUrl: finalVideoUrl,
        platform: 'tiktok',
        status: dbStatus,
        scheduledFor: scheduledFor || null,
        latePostId: latePostId,
        platformPostUrl: platformPostUrl,
        createdBy,
      });
    } catch (dbError) {
      dbWarning = `Local DB save failed after Late post creation: ${(dbError as Error).message}`;
      logError('DB', dbWarning);
    }

    // If published, update with published metadata
    if (dbStatus === 'published' && dbPost?.id) {
      try {
        await updatePost(dbPost.id, {
          publishedAt: tiktokPlatform?.publishedAt || new Date().toISOString(),
          externalPostId: platformPostId,
          platformPostUrl: platformPostUrl,
          publishAttempts: 1,
          lastCheckedAt: new Date().toISOString(),
        });
      } catch (dbError) {
        dbWarning = `Local DB update failed after Late post creation: ${(dbError as Error).message}`;
        logError('DB', dbWarning);
      }
    }

    const totalMs = Date.now() - startTime;
    log('DONE', `Completed in ${totalMs}ms`, {
      status: dbStatus,
      latePostId,
      dbPostId: dbPost?.id,
      platformPostUrl,
    });

    // Build response
    const message = dbStatus === 'published'
      ? 'Video published to TikTok!'
      : dbStatus === 'scheduled'
        ? `Video scheduled for ${scheduledFor}`
        : dbStatus === 'failed'
          ? 'Video failed to publish. Check logs for details.'
          : 'Video is being published to TikTok...';

    const successPayload = {
      success: dbStatus !== 'failed',
      forced: isForceRepost,
      post: {
        id: dbPost?.id,
        latePostId,
        status: dbStatus,
        platformPostUrl,
        platformPostId,
        platforms: latePost.platforms,
      },
      message,
      warning: dbWarning,
      storedLocally: !!dbPost,
      timing: {
        downloadMs,
        uploadMs: Date.now() - uploadStart,
        totalMs,
      },
    };
    if (idempotencyAcquired && idempotencyKey) {
      await completePostIdempotency({
        key: idempotencyKey,
        latePostId,
        response: successPayload,
      });
    }
    return NextResponse.json(successPayload);
  } catch (error) {
    const totalMs = Date.now() - startTime;
    const isLateError = error instanceof LateApiError;
    if (idempotencyAcquired && idempotencyKey) {
      await clearPostIdempotency(idempotencyKey);
    }

    logError('FAILED', `Failed after ${totalMs}ms:`, {
      message: (error as Error).message,
      status: isLateError ? (error as LateApiError).status : undefined,
      body: isLateError ? (error as LateApiError).body : undefined,
    });

    // Return structured error
    const status = isLateError ? Math.min((error as LateApiError).status || 500, 599) : 500;
    return NextResponse.json(
      {
        error: (error as Error).message,
        details: isLateError ? (error as LateApiError).body : undefined,
        timing: { totalMs },
      },
      { status: status || 500 }
    );
  } finally {
    // No-op
  }
}
