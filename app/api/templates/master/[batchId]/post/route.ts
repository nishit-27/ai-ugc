import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getPipelineBatch, getTemplateJob, updateTemplateJobPostStatus, getModelAccountMappings, createPost } from '@/lib/db';
import { lateApiRequest, LateApiError } from '@/lib/lateApi';
import { downloadToBuffer } from '@/lib/storage';
import { config } from '@/lib/config';
import path from 'path';
import type { MasterConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

    // --- Validate batch ---
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

    const results: PostResult[] = [];

    for (const jobId of jobIds) {
      try {
        log('JOB', `Processing job ${jobId}`);

        // --- Get the template job ---
        const job = await getTemplateJob(jobId);
        if (!job) {
          results.push({ jobId, status: 'skipped', error: 'Job not found' });
          continue;
        }

        if (!job.outputUrl || job.status !== 'completed') {
          results.push({ jobId, status: 'skipped', error: 'Job has no output or is not completed' });
          continue;
        }

        // Skip jobs that have already been posted to avoid duplicate posts (unless force=true for repost)
        if (job.postStatus === 'posted' && !force) {
          log('JOB', `Job ${jobId}: already posted, skipping to avoid duplicate`);
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'Already posted' });
          continue;
        }

        // --- Find this job's model accounts ---
        // First try masterConfig (frozen at batch creation), then fall back to
        // current DB mappings so accounts linked after batch creation still work.
        const modelConfig = masterConfig.models.find((m) => m.modelId === job.modelId);
        const accountMappings: { lateAccountId: string; platform: string }[] = await getModelAccountMappings(job.modelId!);

        let platformTargets: { accountId: string; platform: string }[];

        if (modelConfig?.accountIds && modelConfig.accountIds.length > 0) {
          // Use masterConfig account IDs with platform info from current mappings
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
          // Fall back to current DB mappings (accounts linked after batch creation)
          platformTargets = accountMappings.map((m) => ({
            accountId: m.lateAccountId,
            platform: m.platform,
          }));
        }

        if (platformTargets.length === 0) {
          results.push({ jobId, modelId: job.modelId, status: 'skipped', error: 'No social accounts linked to this model. Go to /models to link accounts.' });
          continue;
        }

        log('PLATFORMS', `Job ${jobId}: posting to ${platformTargets.length} accounts`, platformTargets);

        // --- Step 1: Get presigned upload URL from Late API ---
        const filename = path.basename(job.outputUrl.split('?')[0]);
        const presignData = await lateApiRequest<PresignResponse>('/media/presign', {
          method: 'POST',
          body: JSON.stringify({ filename, contentType: 'video/mp4' }),
        });

        log('PRESIGN', `Job ${jobId}: got presigned URL`, { publicUrl: presignData.publicUrl });

        // --- Step 2: Download video and upload to Late API storage ---
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

        // Brief wait for Late API to process the upload
        await new Promise((r) => setTimeout(r, 2000));

        // --- Step 3: Build platform-specific data ---
        const caption = masterConfig.caption || '';
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

        // --- Step 4: Create post via Late API ---
        const postBody: Record<string, unknown> = {
          content: caption,
          mediaItems: [{ type: 'video', url: presignData.publicUrl }],
          platforms: latePlatforms,
        };

        const mode = masterConfig.publishMode || 'now';
        switch (mode) {
          case 'now':
            postBody.publishNow = true;
            break;
          case 'schedule':
            postBody.scheduledFor = masterConfig.scheduledFor;
            postBody.timezone = masterConfig.timezone || config.defaultTimezone;
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
        log('POST', `Job ${jobId}: Late post created: ${latePostId}`);

        // --- Step 5: Save DB post records per platform/account ---
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
              scheduledFor: masterConfig.scheduledFor || null,
              latePostId,
              platformPostUrl: platformResult?.platformPostUrl || null,
              createdBy,
            });
          } catch (dbError) {
            logError('DB', `Failed to save post record for ${target.platform}/${target.accountId}:`, (dbError as Error).message);
          }
        }

        // --- Step 6: Update template job post status ---
        await updateTemplateJobPostStatus(jobId, 'posted');

        results.push({
          jobId,
          modelId: job.modelId,
          latePostId,
          status: 'posted',
          platforms: platformTargets.map((t) => t.platform),
        });

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
      }
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
