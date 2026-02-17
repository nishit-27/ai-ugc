import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { initDatabase, getPipelineBatch, getTemplateJob, getTemplateJobsByBatchId, updateTemplateJobPostStatus, getModelAccountMappings, createPost, getPostsByJobIds, acquireTemplateJobPostLock, releaseTemplateJobPostLock, beginPostIdempotency, completePostIdempotency, clearPostIdempotency } from '@/lib/db';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { downloadToBuffer } from '@/lib/storage';
import { config } from '@/lib/config';
import path from 'path';
import type { MasterConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// In-flight lock: prevents concurrent posting of the same batch
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
  const requestId = `master-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = await auth();
  const createdBy = session?.user?.name?.split(' ')[0] || null;

  const log = (stage: string, ...args: unknown[]) => {
    console.log(`[Master Post][${requestId}][${stage}]`, ...args);
  };
  const logError = (stage: string, ...args: unknown[]) => {
    console.error(`[Master Post][${requestId}][${stage}]`, ...args);
  };

  try {
    await initDatabase();

    const body = await request.json();
    const { jobIds, force } = body as { jobIds: string[]; force?: boolean };

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds array is required' }, { status: 400 });
    }

    log('START', `Posting ${jobIds.length} jobs from batch ${batchId}`);

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

    if (!config.LATE_API_KEY) {
      return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 500 });
    }

    const allBatchJobs = await getTemplateJobsByBatchId(batchId);
    const postedModelIds = new Set<string>();
    for (const j of allBatchJobs) {
      if (j.postStatus === 'posted' && j.modelId && !jobIds.includes(j.id)) {
        postedModelIds.add(j.modelId);
      }
    }

    const results: PostResult[] = [];

    // Get or create in-flight set for this batch
    if (!inflightBatches.has(batchId)) {
      inflightBatches.set(batchId, new Set());
    }
    const inflightJobs = inflightBatches.get(batchId)!;

    for (const jobId of jobIds) {
      let hasDbLock = false;
      let jobIdempotencyKey: string | null = null;
      let jobIdempotencyAcquired = false;
      let createdLatePostId: string | null = null;
      try {
        // Skip if another request is already posting this job
        if (inflightJobs.has(jobId)) {
          log('JOB', `Job ${jobId}: already being posted by another request, skipping`);
          results.push({ jobId, status: 'skipped', error: 'Already being posted' });
          continue;
        }
        inflightJobs.add(jobId);

        // Cross-instance lock: prevents duplicate posting when requests hit different servers.
        hasDbLock = await acquireTemplateJobPostLock(jobId);
        if (!hasDbLock) {
          log('JOB', `Job ${jobId}: DB lock already held, skipping duplicate request`);
          results.push({ jobId, status: 'skipped', error: 'Already being posted' });
          continue;
        }

        log('JOB', `Processing job ${jobId}`);

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
          log('JOB', `Job ${jobId}: already posted, skipping`);
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
          continue;
        }

        if (!force && job.modelId && postedModelIds.has(job.modelId)) {
          log('JOB', `Job ${jobId}: another job for model ${job.modelId} already posted in this batch, skipping`);
          await updateTemplateJobPostStatus(jobId, 'posted');
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Model already posted in this batch' });
          continue;
        }

        const existingPosts = await getPostsByJobIds([jobId]);
        if (force) {
          const succeededAccounts = new Set(
            existingPosts
              .filter((p: { status: string }) => p.status === 'published' || p.status === 'scheduled' || p.status === 'publishing')
              .map((p: { lateAccountId: string }) => p.lateAccountId)
          );
          if (succeededAccounts.size > 0) {
            log('REPOST', `Job ${jobId}: ${succeededAccounts.size} platform(s) already succeeded, filtering them out`);
          }
        } else {
          const hasAnyPost = existingPosts.some((p: { status: string }) =>
            p.status === 'published' ||
            p.status === 'scheduled' ||
            p.status === 'publishing' ||
            p.status === 'pending' ||
            p.status === 'partial' ||
            p.status === 'failed'
          );
          if (hasAnyPost) {
            log('JOB', `Job ${jobId}: posts already exist, skipping`);
            await updateTemplateJobPostStatus(jobId, 'posted');
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
            continue;
          }
        }

        const modelConfig = masterConfig.models.find((m) => m.modelId === job.modelId);
        const accountMappings: { lateAccountId: string; platform: string }[] = await getModelAccountMappings(job.modelId!);

        let platformTargets: { accountId: string; platform: string }[];

        if (modelConfig?.accountIds && modelConfig.accountIds.length > 0) {
          const accountPlatformMap = new Map<string, string>();
          for (const mapping of accountMappings) {
            accountPlatformMap.set(mapping.lateAccountId, mapping.platform);
          }
          platformTargets = modelConfig.accountIds
            .map((accountId) => ({
              accountId,
              platform: accountPlatformMap.get(accountId) || 'tiktok',
            }))
            .filter((t) => t.accountId);
        } else {
          platformTargets = accountMappings.map((m) => ({
            accountId: m.lateAccountId,
            platform: m.platform,
          }));
        }

        if (platformTargets.length === 0) {
          // Still mark as posted so user's approval is recorded even without social accounts
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
            log('JOB', `Job ${jobId}: all platforms already succeeded`);
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'All platforms already succeeded' });
            continue;
          }
          log('REPOST', `Job ${jobId}: retrying ${platformTargets.length} failed platform(s)`);
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
            log('DEDUPE', `Job ${jobId}: suppressing duplicate request (idempotency processing lock)`);
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already being posted' });
            continue;
          }

          if (idemState.state === 'completed') {
            log('DEDUPE', `Job ${jobId}: suppressing duplicate request (idempotency completed)`);
            try {
              await updateTemplateJobPostStatus(jobId, 'posted');
            } catch {}
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
            log('DEDUPE', `Job ${jobId}: suppressing duplicate request (idempotency mismatch)`);
            results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
            continue;
          }

          jobIdempotencyAcquired = true;
        }

        log('PLATFORMS', `Job ${jobId}: posting to ${platformTargets.length} accounts`, platformTargets);

        const filename = path.basename(job.outputUrl.split('?')[0]);
        const presignData = await lateApiRequest<PresignResponse>('/media/presign', {
          method: 'POST',
          body: JSON.stringify({ filename, contentType: 'video/mp4' }),
        });

        log('PRESIGN', `Job ${jobId}: got presigned URL`, { publicUrl: presignData.publicUrl });

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

        const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
        log('DOWNLOAD', `Job ${jobId}: downloaded ${fileSizeMB}MB`);

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

          log('UPLOAD', `Job ${jobId}: upload complete`);
        } catch (uploadErr) {
          clearTimeout(uploadTimeout);
          if (uploadErr instanceof Error && uploadErr.name === 'AbortError') {
            throw new Error('Video upload timed out.');
          }
          throw uploadErr;
        }

        await new Promise((r) => setTimeout(r, 2000));
        const latePlatforms = platformTargets.map((t) => {
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
              platformSpecificData: {
                shareToFeed: true,
                thumbOffset: 0,
              },
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
          return {
            platform: t.platform,
            accountId: t.accountId,
          };
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

        log('POST', `Job ${jobId}: creating Late API post`, { mode, platformCount: latePlatforms.length });

        const postData = await lateApiRequest<CreatePostResponse>('/posts', {
          method: 'POST',
          body: JSON.stringify(postBody),
          timeout: 60000,
        });

        const latePost = postData.post;
        const latePostId = latePost._id;
        createdLatePostId = latePostId;
        log('POST', `Job ${jobId}: Late post created: ${latePostId}`);

        for (const target of platformTargets) {
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
              jobId: jobId,
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
            });
          } catch (dbError) {
            logError('DB', `Failed to save post record for ${target.platform}/${target.accountId}:`, (dbError as Error).message);
          }
        }

        await updateTemplateJobPostStatus(jobId, 'posted');

        if (job.modelId) {
          postedModelIds.add(job.modelId);
        }

        results.push({
          jobId,
          modelId: job.modelId,
          latePostId,
          status: 'posted',
          platforms: platformTargets.map((t) => t.platform),
        });

        if (jobIdempotencyAcquired && jobIdempotencyKey) {
          await completePostIdempotency({
            key: jobIdempotencyKey,
            latePostId,
            response: {
              jobId,
              modelId: job.modelId,
              latePostId,
              status: 'posted',
              platforms: platformTargets.map((t) => t.platform),
            },
          });
        }

        log('JOB', `Job ${jobId}: successfully posted`);
      } catch (jobError) {
        const errorMessage = jobError instanceof LateApiError
          ? `Late API ${jobError.status}: ${jobError.message}`
          : (jobError as Error).message;

        logError('JOB', `Job ${jobId} failed:`, errorMessage);

        results.push({
          jobId,
          status: 'failed',
          error: errorMessage,
        });

        if (jobIdempotencyAcquired && jobIdempotencyKey) {
          try {
            if (createdLatePostId) {
              await completePostIdempotency({
                key: jobIdempotencyKey,
                latePostId: createdLatePostId,
                response: {
                  jobId,
                  latePostId: createdLatePostId,
                  status: 'posted',
                },
              });
            } else {
              await clearPostIdempotency(jobIdempotencyKey);
            }
          } catch (idemError) {
            logError('DEDUPE', `Job ${jobId}: failed to finalize idempotency state`, (idemError as Error).message);
          }
        }
      } finally {
        if (hasDbLock) {
          try {
            await releaseTemplateJobPostLock(jobId);
          } catch (lockError) {
            logError('LOCK', `Failed to release DB lock for ${jobId}:`, (lockError as Error).message);
          }
        }
        inflightJobs.delete(jobId);
      }
    }

    // Cleanup batch from in-flight map if no more jobs
    if (inflightJobs.size === 0) {
      inflightBatches.delete(batchId);
    }

    const posted = results.filter((r) => r.status === 'posted').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    log('DONE', `Posted: ${posted}, Skipped: ${skipped}, Failed: ${failed}`);

    return NextResponse.json({
      success: posted > 0,
      results,
      summary: { posted, skipped, failed, total: jobIds.length },
    });
  } catch (error) {
    logError('FATAL', 'Unhandled error:', (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to post videos' },
      { status: 500 }
    );
  }
}
