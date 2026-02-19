import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { initDatabase, getPipelineBatch, getTemplateJob, getTemplateJobsByBatchId, updateTemplateJobPostStatus, getModelAccountMappings, createPost, getPostsByJobIds, acquireTemplateJobPostLock, releaseTemplateJobPostLock, beginPostIdempotency, completePostIdempotency, clearPostIdempotency } from '@/lib/db';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { getApiKeyByIndex } from '@/lib/lateAccountPool';
import { downloadToBuffer } from '@/lib/storage';
import { config } from '@/lib/config';
import path from 'path';
import type { MasterConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const inflightBatches = new Map<string, Set<string>>();

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

type PostResult = {
  jobId: string;
  modelId?: string;
  latePostId?: string;
  status: 'posted' | 'skipped' | 'failed';
  error?: string;
  platforms?: string[];
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const session = await auth();
  const createdBy = session?.user?.name?.split(' ')[0] || null;

  try {
    await initDatabase();

    const body = await request.json();
    const { jobIds, force } = body as { jobIds: string[]; force?: boolean };

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds array is required' }, { status: 400 });
    }

    const batch = await getPipelineBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }
    if (!batch.isMaster) {
      return NextResponse.json({ error: 'Batch is not a master batch' }, { status: 400 });
    }

    const masterConfig = batch.masterConfig as MasterConfig | undefined;
    if (!masterConfig) {
      return NextResponse.json({ error: 'Master config not found on batch' }, { status: 400 });
    }

    if (!config.LATE_API_KEYS.length) {
      return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
    }

    const allBatchJobs = await getTemplateJobsByBatchId(batchId);
    const postedModelIds = new Set<string>();
    for (const j of allBatchJobs) {
      if (j.postStatus === 'posted' && j.modelId && !jobIds.includes(j.id)) {
        postedModelIds.add(j.modelId);
      }
    }

    const results: PostResult[] = [];

    if (!inflightBatches.has(batchId)) {
      inflightBatches.set(batchId, new Set());
    }
    const inflightJobs = inflightBatches.get(batchId)!;

    for (const jobId of jobIds) {
      let hasDbLock = false;
      let jobIdempotencyKey: string | null = null;
      let jobIdempotencyAcquired = false;
      const createdLatePostIds: string[] = [];
      try {
        if (inflightJobs.has(jobId)) {
          results.push({ jobId, status: 'skipped', error: 'Already being posted' });
          continue;
        }
        inflightJobs.add(jobId);

        hasDbLock = await acquireTemplateJobPostLock(jobId);
        if (!hasDbLock) {
          results.push({ jobId, status: 'skipped', error: 'Already being posted' });
          continue;
        }

        const job = await getTemplateJob(jobId);
        if (!job) {
          results.push({ jobId, status: 'skipped', error: 'Job not found' });
          continue;
        }

        if (!job.outputUrl || job.status !== 'completed') {
          results.push({ jobId, status: 'skipped', error: 'Job has no output or is not completed' });
          continue;
        }

        if (job.postStatus === 'posted' && !force) {
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
          continue;
        }

        if (!force && job.modelId && postedModelIds.has(job.modelId)) {
          await updateTemplateJobPostStatus(jobId, 'posted');
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Model already posted in this batch' });
          continue;
        }

        const existingPosts = await getPostsByJobIds([jobId]);
        if (!force) {
          const hasAnyPost = existingPosts.some((p: { status: string }) =>
            p.status === 'published' ||
            p.status === 'scheduled' ||
            p.status === 'publishing' ||
            p.status === 'pending' ||
            p.status === 'partial' ||
            p.status === 'failed'
          );
          if (hasAnyPost) {
            await updateTemplateJobPostStatus(jobId, 'posted');
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
            continue;
          }
        }

        const modelConfig = masterConfig.models.find((m) => m.modelId === job.modelId);
        const accountMappings: { lateAccountId: string; platform: string; apiKeyIndex: number }[] = await getModelAccountMappings(job.modelId!);

        let platformTargets: { accountId: string; platform: string; apiKeyIndex: number }[];

        if (modelConfig?.accountIds && modelConfig.accountIds.length > 0) {
          const accountInfoMap = new Map<string, { platform: string; apiKeyIndex: number }>();
          for (const mapping of accountMappings) {
            accountInfoMap.set(mapping.lateAccountId, { platform: mapping.platform, apiKeyIndex: mapping.apiKeyIndex ?? 0 });
          }
          platformTargets = modelConfig.accountIds
            .map((accountId) => {
              const info = accountInfoMap.get(accountId);
              return {
                accountId,
                platform: info?.platform || 'tiktok',
                apiKeyIndex: info?.apiKeyIndex ?? 0,
              };
            })
            .filter((t) => t.accountId);
        } else {
          platformTargets = accountMappings.map((m) => ({
            accountId: m.lateAccountId,
            platform: m.platform,
            apiKeyIndex: m.apiKeyIndex ?? 0,
          }));
        }

        if (platformTargets.length === 0) {
          await updateTemplateJobPostStatus(jobId, 'posted');
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'No social accounts linked to this model. Go to /models to link accounts.' });
          continue;
        }

        const caption = job.captionOverride ?? masterConfig.caption ?? '';
        const effectivePublishMode = job.publishModeOverride ?? masterConfig.publishMode ?? 'now';
        const effectiveScheduledFor = job.scheduledForOverride ?? masterConfig.scheduledFor;
        const effectiveTimezone = job.timezoneOverride ?? masterConfig.timezone;

        if (force) {
          const succeededAccounts = new Set(
            existingPosts
              .filter((p: { status: string }) => p.status === 'published' || p.status === 'scheduled' || p.status === 'publishing')
              .map((p: { lateAccountId: string }) => p.lateAccountId)
          );
          platformTargets = platformTargets.filter((t) => !succeededAccounts.has(t.accountId));
          if (platformTargets.length === 0) {
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'All platforms already succeeded' });
            continue;
          }
        } else {
          const normalizedMode = effectivePublishMode || 'now';
          const normalizedScheduledFor = normalizedMode === 'schedule' ? (effectiveScheduledFor || null) : null;
          const normalizedTimezone = normalizedMode === 'schedule'
            ? (effectiveTimezone || config.defaultTimezone)
            : null;
          const platformFingerprint = [...new Set(
            platformTargets
              .map((t) => `${t.platform}:${t.accountId}`)
              .filter(Boolean)
          )].sort();
          const idempotencyRequestHash = createHash('sha256')
            .update(JSON.stringify({
              batchId,
              jobId,
              outputUrl: job.outputUrl,
              caption,
              mode: normalizedMode,
              scheduledFor: normalizedScheduledFor,
              timezone: normalizedTimezone,
              platforms: platformFingerprint,
            }))
            .digest('hex');
          jobIdempotencyKey = `master-post:${jobId}`;

          const idemState = await beginPostIdempotency({
            key: jobIdempotencyKey,
            requestHash: idempotencyRequestHash,
          });

          if (idemState.state === 'processing') {
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already being posted' });
            continue;
          }

          if (idemState.state === 'completed') {
            try { await updateTemplateJobPostStatus(jobId, 'posted'); } catch {}
            results.push({
              jobId,
              modelId: job.modelId,
              latePostId: idemState.latePostId || undefined,
              status: 'skipped',
              error: 'Already posted',
            });
            continue;
          }

          if (idemState.state === 'mismatch') {
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
            continue;
          }

          jobIdempotencyAcquired = true;
        }

        // Group platform targets by apiKeyIndex
        const targetsByKey = new Map<number, typeof platformTargets>();
        for (const target of platformTargets) {
          const list = targetsByKey.get(target.apiKeyIndex) || [];
          list.push(target);
          targetsByKey.set(target.apiKeyIndex, list);
        }

        // Download video once
        let fileBuffer: Buffer;
        if (job.outputUrl.startsWith('https://storage.googleapis.com')) {
          fileBuffer = await downloadToBuffer(job.outputUrl);
        } else {
          const response = await fetch(job.outputUrl);
          if (!response.ok) {
            throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
        }

        // Create a separate Late post per API key group
        for (const [keyIndex, groupTargets] of targetsByKey) {
          const apiKey = getApiKeyByIndex(keyIndex);
          const filename = path.basename(job.outputUrl.split('?')[0]);

          const presignData = await lateApiRequest<PresignResponse>('/media/presign', {
            method: 'POST',
            body: JSON.stringify({ filename, contentType: 'video/mp4' }),
            apiKey,
          });

          const uploadController = new AbortController();
          const uploadTimeout = setTimeout(() => uploadController.abort(), 120000);

          try {
            const uploadResponse = await fetch(presignData.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
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
              throw new Error('Video upload timed out.');
            }
            throw uploadErr;
          }

          await new Promise((r) => setTimeout(r, 2000));

          const latePlatforms = groupTargets.map((t) => {
            if (t.platform === 'tiktok') {
              return {
                platform: 'tiktok',
                accountId: t.accountId,
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
            } else if (t.platform === 'instagram') {
              return {
                platform: 'instagram',
                accountId: t.accountId,
                platformSpecificData: { shareToFeed: true, thumbOffset: 0 },
              };
            } else if (t.platform === 'youtube') {
              return {
                platform: 'youtube',
                accountId: t.accountId,
                platformSpecificData: {
                  title: (caption || 'Untitled Video').split('\n')[0].slice(0, 100),
                  visibility: 'public',
                  madeForKids: false,
                  categoryId: '22',
                },
              };
            }
            return { platform: t.platform, accountId: t.accountId };
          });

          const postBody: Record<string, unknown> = {
            content: caption,
            mediaItems: [{ type: 'video', url: presignData.publicUrl }],
            platforms: latePlatforms,
          };

          const mode = effectivePublishMode;
          switch (mode) {
            case 'now':
              postBody.publishNow = true;
              break;
            case 'schedule':
              postBody.scheduledFor = effectiveScheduledFor;
              postBody.timezone = effectiveTimezone || config.defaultTimezone;
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
          createdLatePostIds.push(latePostId);

          for (const target of groupTargets) {
            const platformResult = latePost.platforms?.find((p) => {
              const pAccountId = typeof p.accountId === 'object' ? p.accountId._id : p.accountId;
              return p.platform === target.platform && pAccountId === target.accountId;
            });

            const platformStatus = platformResult?.status || latePost.status;
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
              await createPost({
                jobId,
                accountId: null,
                lateAccountId: target.accountId,
                caption,
                videoUrl: job.outputUrl,
                platform: target.platform,
                status: dbStatus,
                scheduledFor: effectiveScheduledFor || null,
                latePostId,
                platformPostUrl: platformResult?.platformPostUrl || null,
                createdBy,
                apiKeyIndex: keyIndex,
              });
            } catch {
              // DB save failed, continue
            }
          }
        }

        await updateTemplateJobPostStatus(jobId, 'posted');
        if (job.modelId) postedModelIds.add(job.modelId);

        results.push({
          jobId,
          modelId: job.modelId,
          latePostId: createdLatePostIds[0],
          status: 'posted',
          platforms: platformTargets.map((t) => t.platform),
        });

        if (jobIdempotencyAcquired && jobIdempotencyKey) {
          await completePostIdempotency({
            key: jobIdempotencyKey,
            latePostId: createdLatePostIds[0],
            response: {
              jobId,
              modelId: job.modelId,
              latePostId: createdLatePostIds[0],
              status: 'posted',
              platforms: platformTargets.map((t) => t.platform),
            },
          });
        }
      } catch (jobError) {
        const errorMessage = jobError instanceof LateApiError
          ? `Late API ${jobError.status}: ${jobError.message}`
          : (jobError as Error).message;

        results.push({ jobId, status: 'failed', error: errorMessage });

        if (jobIdempotencyAcquired && jobIdempotencyKey) {
          try {
            if (createdLatePostIds.length > 0) {
              await completePostIdempotency({
                key: jobIdempotencyKey,
                latePostId: createdLatePostIds[0],
                response: { jobId, latePostId: createdLatePostIds[0], status: 'posted' },
              });
            } else {
              await clearPostIdempotency(jobIdempotencyKey);
            }
          } catch {
            // idempotency finalization failed
          }
        }
      } finally {
        if (hasDbLock) {
          try { await releaseTemplateJobPostLock(jobId); } catch {}
        }
        inflightJobs.delete(jobId);
      }
    }

    if (inflightJobs.size === 0) inflightBatches.delete(batchId);

    const posted = results.filter((r) => r.status === 'posted').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      success: posted > 0,
      results,
      summary: { posted, skipped, failed, total: jobIds.length },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to post videos' },
      { status: 500 }
    );
  }
}
