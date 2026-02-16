import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { config } from '@/lib/config';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { downloadToBuffer } from '@/lib/storage';
import { createPost, updatePost, findRecentDuplicatePost } from '@/lib/db';
import { auth } from '@/lib/auth';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

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

type PlatformTarget = {
  platform: 'tiktok' | 'instagram' | 'youtube';
  accountId: string;
};

const DEDUPE_WINDOW_MS = 30_000;
const inFlightDedupeByKey = new Map<string, number>();
const recentSuccessByKey = new Map<string, { timestamp: number; latePostId?: string; platforms?: LatePostPlatform[] }>();

function pruneDedupeMaps(now = Date.now()) {
  for (const [key, timestamp] of inFlightDedupeByKey) {
    if (now - timestamp > DEDUPE_WINDOW_MS) inFlightDedupeByKey.delete(key);
  }
  for (const [key, data] of recentSuccessByKey) {
    if (now - data.timestamp > DEDUPE_WINDOW_MS) recentSuccessByKey.delete(key);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let dedupeKeyValue: string | null = null;
  let dedupeKeyLocked = false;

  const log = (stage: string, ...args: unknown[]) => {
    console.log(`[Post Upload][${requestId}][${stage}]`, ...args);
  };
  const logError = (stage: string, ...args: unknown[]) => {
    console.error(`[Post Upload][${requestId}][${stage}]`, ...args);
  };

  log('START', 'Request received');

  try {
    const body = await request.json();
    const {
      videoUrl,
      caption,
      platforms,
      publishMode,
      scheduledFor,
      timezone,
      jobId,
      dedupeKey,
    } = body as {
      videoUrl?: string;
      caption?: string;
      platforms?: PlatformTarget[];
      publishMode?: 'now' | 'schedule' | 'queue' | 'draft';
      scheduledFor?: string;
      timezone?: string;
      jobId?: string;
      dedupeKey?: string;
    };

    log('PARSE', 'Parsed request body', {
      hasVideoUrl: !!videoUrl,
      captionLength: caption?.length || 0,
      platformCount: platforms?.length || 0,
      publishMode,
      scheduledFor: scheduledFor || 'none',
      timezone: timezone || config.defaultTimezone,
    });

    // --- Validation ---
    if (!config.LATE_API_KEY) {
      logError('VALIDATE', 'LATE_API_KEY not configured');
      return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
    }

    if (!videoUrl) {
      logError('VALIDATE', 'No video URL provided');
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    if (!platforms || platforms.length === 0) {
      logError('VALIDATE', 'No platforms provided');
      return NextResponse.json({ error: 'At least one platform/account is required' }, { status: 400 });
    }

    const mode = publishMode || 'now';
    if (mode === 'schedule' && !scheduledFor) {
      logError('VALIDATE', 'Schedule mode requires scheduledFor');
      return NextResponse.json({ error: 'scheduledFor is required for schedule mode' }, { status: 400 });
    }

    dedupeKeyValue = typeof dedupeKey === 'string' && dedupeKey.trim() ? dedupeKey.trim() : null;
    pruneDedupeMaps();
    if (dedupeKeyValue) {
      const recentSuccess = recentSuccessByKey.get(dedupeKeyValue);
      if (recentSuccess && Date.now() - recentSuccess.timestamp <= DEDUPE_WINDOW_MS) {
        log('DEDUPE', 'Suppressing duplicate request from recent success');
        return NextResponse.json({
          success: true,
          deduped: true,
          message: 'Duplicate request suppressed. Existing post is already being processed.',
          post: {
            latePostId: recentSuccess.latePostId,
            platforms: recentSuccess.platforms || [],
          },
        });
      }

      const inFlightAt = inFlightDedupeByKey.get(dedupeKeyValue);
      if (inFlightAt && Date.now() - inFlightAt <= DEDUPE_WINDOW_MS) {
        log('DEDUPE', 'Suppressing duplicate request while first submission is in-flight');
        return NextResponse.json({
          success: true,
          deduped: true,
          message: 'Identical post request is already being processed.',
        });
      }

      inFlightDedupeByKey.set(dedupeKeyValue, Date.now());
      dedupeKeyLocked = true;
    }

    log('MODE', `Publish mode: ${mode}`);

    const lateAccountIds = [...new Set(platforms.map((platform) => platform.accountId).filter(Boolean))];
    try {
      const recentDuplicate = await findRecentDuplicatePost({
        caption: caption || '',
        videoUrl,
        lateAccountIds,
        mode,
        scheduledFor: scheduledFor || null,
        withinSeconds: Math.floor(DEDUPE_WINDOW_MS / 1000),
      });
      if (recentDuplicate?.latePostId) {
        log('DEDUPE', `Suppressing duplicate using DB match: ${recentDuplicate.latePostId}`);
        if (dedupeKeyValue) {
          recentSuccessByKey.set(dedupeKeyValue, {
            timestamp: Date.now(),
            latePostId: recentDuplicate.latePostId,
          });
        }
        return NextResponse.json({
          success: true,
          deduped: true,
          message: 'Duplicate request suppressed. A matching post was already created.',
          post: {
            latePostId: recentDuplicate.latePostId,
            platforms: [],
          },
        });
      }
    } catch (dedupeError) {
      logError('DEDUPE', 'Recent duplicate DB check failed:', (dedupeError as Error).message);
    }

    // --- Step 1: Get presigned upload URL from Late API ---
    log('PRESIGN', 'Requesting presigned URL from Late API...');
    const filename = path.basename(videoUrl.split('?')[0]);
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

    log('PRESIGN', 'Got presigned URL', { publicUrl: presignData.publicUrl });

    // --- Step 2: Download video and upload to Late API storage ---
    log('DOWNLOAD', `Downloading video from: ${videoUrl.slice(0, 80)}...`);
    const downloadStart = Date.now();

    let fileBuffer: Buffer;
    if (videoUrl.startsWith('https://storage.googleapis.com')) {
      fileBuffer = await downloadToBuffer(videoUrl);
    } else {
      const response = await fetch(videoUrl);
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
    const uploadTimeout = setTimeout(() => uploadController.abort(), 120000);

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

    // --- Step 3: Build platform-specific data for each target ---
    log('POST', 'Creating post via Late API...');

    const latePlatforms = platforms.map((p) => {
      if (p.platform === 'tiktok') {
        return {
          platform: 'tiktok',
          accountId: p.accountId,
          platformSpecificData: {
            privacyLevel: 'PUBLIC_TO_EVERYONE',
            allowComment: true,
            allowDuet: true,
            allowStitch: true,
            contentPreviewConfirmed: true,
            expressConsentGiven: true,
            videoMadeWithAi: false,
            videoCoverTimestampMs: 1000,
          },
        };
      } else if (p.platform === 'instagram') {
        return {
          platform: 'instagram',
          accountId: p.accountId,
          platformSpecificData: {
            shareToFeed: true,
            thumbOffset: 0,
          },
        };
      } else if (p.platform === 'youtube') {
        return {
          platform: 'youtube',
          accountId: p.accountId,
          platformSpecificData: {
            title: (caption || 'Untitled Video').split('\n')[0].slice(0, 100),
            visibility: 'public',
            madeForKids: false,
            categoryId: '22', // People & Blogs
          },
        };
      }
      return {
        platform: p.platform,
        accountId: p.accountId,
      };
    });

    const postBody: Record<string, unknown> = {
      content: caption || '',
      mediaItems: [{ type: 'video', url: presignData.publicUrl }],
      platforms: latePlatforms,
    };

    // Set publish timing based on mode
    switch (mode) {
      case 'now':
        postBody.publishNow = true;
        log('POST', 'Publishing immediately');
        break;
      case 'schedule':
        postBody.scheduledFor = scheduledFor;
        postBody.timezone = timezone || config.defaultTimezone;
        postBody.publishNow = false;
        log('POST', `Scheduling for ${scheduledFor} (${postBody.timezone})`);
        break;
      case 'queue':
        postBody.publishNow = false;
        postBody.addToQueue = true;
        log('POST', 'Adding to queue');
        break;
      case 'draft':
        postBody.isDraft = true;
        postBody.publishNow = false;
        log('POST', 'Saving as draft');
        break;
    }

    log('POST', 'Request body:', JSON.stringify(postBody, null, 2));

    const postData = await lateApiRequest<CreatePostResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify(postBody),
      timeout: 60000,
    });

    const latePost = postData.post;
    const latePostId = latePost._id;
    log('POST', `Post created: ${latePostId}, status: ${latePost.status}`);

    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    // --- Step 4: Save one DB row per platform/account ---
    const dbResults: Array<{ platform: string; accountId: string; dbPostId?: string; status: string; warning?: string }> = [];

    for (const target of platforms) {
      const platformResult = latePost.platforms?.find((p) => {
        const pAccountId = typeof p.accountId === 'object' ? p.accountId._id : p.accountId;
        return p.platform === target.platform && pAccountId === target.accountId;
      });

      const platformStatus = platformResult?.status || latePost.status;
      const platformPostUrl = platformResult?.platformPostUrl || null;
      const platformPostId = platformResult?.platformPostId || null;

      // Map Late API status to our DB status
      let dbStatus: string;
      if (mode === 'draft') {
        dbStatus = 'draft';
      } else if (platformStatus === 'published') {
        dbStatus = 'published';
      } else if (latePost.status === 'scheduled' || mode === 'schedule') {
        dbStatus = 'scheduled';
      } else if (platformStatus === 'failed') {
        dbStatus = 'failed';
      } else if (platformStatus === 'partial') {
        dbStatus = 'partial';
      } else {
        dbStatus = mode === 'now' ? 'publishing' : 'pending';
      }

      log('DB', `Saving ${target.platform}/${target.accountId} with status: ${dbStatus}`);

      try {
        const dbPost = await createPost({
          jobId: jobId || null,
          accountId: null,
          lateAccountId: target.accountId,
          caption: caption || '',
          videoUrl,
          platform: target.platform,
          status: dbStatus,
          scheduledFor: scheduledFor || null,
          latePostId,
          platformPostUrl,
          createdBy,
        });

        if (dbStatus === 'published' && dbPost?.id) {
          await updatePost(dbPost.id, {
            publishedAt: platformResult?.publishedAt || new Date().toISOString(),
            externalPostId: platformPostId,
            platformPostUrl,
            publishAttempts: 1,
            lastCheckedAt: new Date().toISOString(),
          });
        }

        dbResults.push({
          platform: target.platform,
          accountId: target.accountId,
          dbPostId: dbPost?.id,
          status: dbStatus,
        });
      } catch (dbError) {
        const warning = `DB save failed for ${target.platform}/${target.accountId}: ${(dbError as Error).message}`;
        logError('DB', warning);
        dbResults.push({
          platform: target.platform,
          accountId: target.accountId,
          status: dbStatus,
          warning,
        });
      }
    }

    const totalMs = Date.now() - startTime;
    log('DONE', `Completed in ${totalMs}ms`, { latePostId, dbResults });

    // Build response message
    const failedCount = dbResults.filter((r) => r.status === 'failed').length;
    const successCount = dbResults.length - failedCount;
    let message: string;
    if (mode === 'draft') {
      message = 'Draft saved!';
    } else if (mode === 'schedule') {
      message = `Post scheduled for ${scheduledFor}`;
    } else if (mode === 'queue') {
      message = 'Post added to queue!';
    } else if (failedCount === 0) {
      message = successCount === 1
        ? `Publishing to ${dbResults[0].platform}...`
        : `Publishing to ${successCount} accounts...`;
    } else {
      message = `${successCount} succeeded, ${failedCount} failed`;
    }

    if (dedupeKeyValue) {
      recentSuccessByKey.set(dedupeKeyValue, {
        timestamp: Date.now(),
        latePostId,
        platforms: latePost.platforms,
      });
      pruneDedupeMaps();
    }

    return NextResponse.json({
      success: failedCount < dbResults.length,
      post: {
        latePostId,
        platforms: latePost.platforms,
      },
      results: dbResults,
      message,
      timing: {
        downloadMs,
        uploadMs: Date.now() - uploadStart,
        totalMs,
      },
    });
  } catch (error) {
    const totalMs = Date.now() - startTime;
    const isLateError = error instanceof LateApiError;
    if (dedupeKeyValue) recentSuccessByKey.delete(dedupeKeyValue);

    logError('FAILED', `Failed after ${totalMs}ms:`, {
      message: (error as Error).message,
      status: isLateError ? (error as LateApiError).status : undefined,
      body: isLateError ? (error as LateApiError).body : undefined,
    });

    const status = isLateError ? Math.min((error as LateApiError).status || 500, 599) : 500;
    const lateBody = isLateError ? (error as LateApiError).body : undefined;

    // Extract a human-readable error message
    let errorMessage = (error as Error).message;
    if (isLateError && lateBody && typeof lateBody === 'object') {
      const body = lateBody as Record<string, unknown>;
      errorMessage = (body.error as string) || (body.message as string) || errorMessage;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: lateBody,
        timing: { totalMs },
      },
      { status: status || 500 }
    );
  } finally {
    if (dedupeKeyLocked && dedupeKeyValue) {
      inFlightDedupeByKey.delete(dedupeKeyValue);
    }
    pruneDedupeMaps();
  }
}
