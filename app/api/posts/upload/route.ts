import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createHash } from 'crypto';
import { config } from '@/lib/config';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';
import { downloadToBuffer } from '@/lib/storage';
import { createPost, updatePost, findRecentDuplicatePost, beginPostIdempotency, completePostIdempotency, clearPostIdempotency } from '@/lib/db';
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
  apiKeyIndex?: number;
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
  let dedupeKeyValue: string | null = null;
  let dedupeKeyLocked = false;
  let idempotencyKey: string | null = null;
  let idempotencyAcquired = false;
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
      forceRepost,
      forceToken,
    } = body as {
      videoUrl?: string;
      caption?: string;
      platforms?: PlatformTarget[];
      publishMode?: 'now' | 'schedule' | 'queue' | 'draft';
      scheduledFor?: string;
      timezone?: string;
      jobId?: string;
      dedupeKey?: string;
      forceRepost?: boolean;
      forceToken?: string;
    };
    if (!config.LATE_API_KEYS.length) {
      return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
    }
    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }
    if (!platforms || platforms.length === 0) {
      return NextResponse.json({ error: 'At least one platform/account is required' }, { status: 400 });
    }
    const mode = publishMode || 'now';
    if (mode === 'schedule' && !scheduledFor) {
      return NextResponse.json({ error: 'scheduledFor is required for schedule mode' }, { status: 400 });
    }
    const isForceRepost = !!forceRepost;
    const normalizedForceToken = typeof forceToken === 'string' && forceToken.trim() ? forceToken.trim() : null;
    if (isForceRepost && !normalizedForceToken) {
      return NextResponse.json({ error: 'forceToken is required when forceRepost is true' }, { status: 400 });
    }
    dedupeKeyValue = !isForceRepost && typeof dedupeKey === 'string' && dedupeKey.trim() ? dedupeKey.trim() : null;
    const platformFingerprint = [...new Set((platforms || [])
      .map((platform) => `${platform.platform}:${platform.accountId}`)
      .filter(Boolean))]
      .sort();
    const computedFingerprint = createHash('sha256')
      .update(JSON.stringify({
        videoUrl,
        caption: caption || '',
        mode,
        scheduledFor: scheduledFor || null,
        timezone: timezone || config.defaultTimezone,
        platforms: platformFingerprint,
      }))
      .digest('hex');
    const idempotencyRequestHash = isForceRepost
      ? createHash('sha256').update(`${computedFingerprint}:${normalizedForceToken}`).digest('hex')
      : computedFingerprint;
    idempotencyKey = isForceRepost
      ? `post-upload:force:${normalizedForceToken}`
      : dedupeKeyValue
        ? `post-upload:${dedupeKeyValue}`
        : `post-upload:fingerprint:${computedFingerprint}`;

    pruneDedupeMaps();
    if (!isForceRepost && dedupeKeyValue) {
      const recentSuccess = recentSuccessByKey.get(dedupeKeyValue);
      if (recentSuccess && Date.now() - recentSuccess.timestamp <= DEDUPE_WINDOW_MS) {
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
        return NextResponse.json({
          success: true,
          deduped: true,
          message: 'Identical post request is already being processed.',
        });
      }
      inFlightDedupeByKey.set(dedupeKeyValue, Date.now());
      dedupeKeyLocked = true;
    }

    const idemState = await beginPostIdempotency({
      key: idempotencyKey,
      requestHash: idempotencyRequestHash,
    });

    if (idemState.state === 'processing') {
      return NextResponse.json({
        success: true,
        deduped: true,
        message: 'Identical post request is already being processed.',
      });
    }
    if (idemState.state === 'completed') {
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
      return NextResponse.json(
        { error: 'Idempotency key already used with different request payload' },
        { status: 409 },
      );
    }
    idempotencyAcquired = true;

    if (!isForceRepost) {
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
          if (dedupeKeyValue) {
            recentSuccessByKey.set(dedupeKeyValue, {
              timestamp: Date.now(),
              latePostId: recentDuplicate.latePostId,
            });
          }
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
      } catch {
        // Recent duplicate DB check failed, continue
      }
    }

    // Group platforms by apiKeyIndex
    const targetsByKey = new Map<number, PlatformTarget[]>();
    for (const p of platforms) {
      const keyIdx = p.apiKeyIndex ?? 0;
      const list = targetsByKey.get(keyIdx) || [];
      list.push(p);
      targetsByKey.set(keyIdx, list);
    }

    // Download video once
    const filename = path.basename(videoUrl.split('?')[0]);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.mov' ? 'video/quicktime' :
      ext === '.webm' ? 'video/webm' :
      'video/mp4';

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

    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;
    const dbResults: Array<{ platform: string; accountId: string; dbPostId?: string; status: string; warning?: string }> = [];
    let firstLatePostId: string | undefined;
    let firstLatePost: LatePost | undefined;
    const uploadStart = Date.now();

    for (const [keyIdx, groupPlatforms] of targetsByKey) {
      const apiKey = getApiKeyByIndex(keyIdx);

      const presignData = await lateApiRequest<PresignResponse>('/media/presign', {
        method: 'POST',
        body: JSON.stringify({ filename, contentType }),
        apiKey,
      });

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
          throw new Error(`File upload to Late storage failed: ${uploadResponse.status} - ${errorText}`);
        }
      } catch (uploadErr) {
        clearTimeout(uploadTimeout);
        if (uploadErr instanceof Error && uploadErr.name === 'AbortError') {
          throw new Error('Video upload timed out. The file may be too large or the network is slow.');
        }
        throw uploadErr;
      }

      await new Promise((r) => setTimeout(r, 2000));

      const latePlatforms = groupPlatforms.map((p) => {
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
            platformSpecificData: { shareToFeed: true, thumbOffset: 0 },
          };
        } else if (p.platform === 'youtube') {
          return {
            platform: 'youtube',
            accountId: p.accountId,
            platformSpecificData: {
              title: (caption || 'Untitled Video').split('\n')[0].slice(0, 100),
              visibility: 'public',
              madeForKids: false,
              categoryId: '22',
            },
          };
        }
        return { platform: p.platform, accountId: p.accountId };
      });

      const postBody: Record<string, unknown> = {
        content: caption || '',
        mediaItems: [{ type: 'video', url: presignData.publicUrl }],
        platforms: latePlatforms,
      };
      switch (mode) {
        case 'now':
          postBody.publishNow = true;
          break;
        case 'schedule':
          postBody.scheduledFor = scheduledFor;
          postBody.timezone = timezone || config.defaultTimezone;
          postBody.publishNow = false;
          break;
        case 'queue':
          postBody.publishNow = false;
          postBody.addToQueue = true;
          break;
        case 'draft':
          postBody.isDraft = true;
          postBody.publishNow = false;
          break;
      }

      const postData = await lateApiRequest<CreatePostResponse>('/posts', {
        method: 'POST',
        body: JSON.stringify(postBody),
        timeout: 60000,
        apiKey,
      });

      const latePost = postData.post;
      const latePostId = latePost._id;
      if (!firstLatePostId) {
        firstLatePostId = latePostId;
        firstLatePost = latePost;
      }

      for (const target of groupPlatforms) {
        const platformResult = latePost.platforms?.find((p) => {
          const pAccountId = typeof p.accountId === 'object' ? p.accountId._id : p.accountId;
          return p.platform === target.platform && pAccountId === target.accountId;
        });
        const platformStatus = platformResult?.status || latePost.status;
        const platformPostUrl = platformResult?.platformPostUrl || null;
        const platformPostId = platformResult?.platformPostId || null;
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
            apiKeyIndex: keyIdx,
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
          dbResults.push({
            platform: target.platform,
            accountId: target.accountId,
            status: dbStatus,
            warning: `DB save failed: ${(dbError as Error).message}`,
          });
        }
      }
    }

    const totalMs = Date.now() - startTime;
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
        latePostId: firstLatePostId,
        platforms: firstLatePost?.platforms,
      });
      pruneDedupeMaps();
    }
    const successPayload = {
      success: failedCount < dbResults.length,
      forced: isForceRepost,
      post: {
        latePostId: firstLatePostId,
        platforms: firstLatePost?.platforms,
      },
      results: dbResults,
      message,
      timing: {
        downloadMs,
        uploadMs: Date.now() - uploadStart,
        totalMs,
      },
    };
    if (idempotencyAcquired && idempotencyKey) {
      await completePostIdempotency({
        key: idempotencyKey,
        latePostId: firstLatePostId,
        response: successPayload,
      });
    }
    return NextResponse.json(successPayload);
  } catch (error) {
    const totalMs = Date.now() - startTime;
    const isLateError = error instanceof LateApiError;
    if (dedupeKeyValue) recentSuccessByKey.delete(dedupeKeyValue);
    if (idempotencyAcquired && idempotencyKey) {
      await clearPostIdempotency(idempotencyKey);
    }
    const status = isLateError ? Math.min((error as LateApiError).status || 500, 599) : 500;
    const lateBody = isLateError ? (error as LateApiError).body : undefined;
    let errorMessage = (error as Error).message;
    if (isLateError && lateBody && typeof lateBody === 'object') {
      const errBody = lateBody as Record<string, unknown>;
      errorMessage = (errBody.error as string) || (errBody.message as string) || errorMessage;
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
