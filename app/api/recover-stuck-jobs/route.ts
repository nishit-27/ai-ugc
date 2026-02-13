import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import {
  initDatabase,
  getStuckJobs,
  getStuckTemplateJobs,
  updateJob,
  updateTemplateJob,
  createMediaFile,
  updateBatchProgress,
  updatePipelineBatchProgress,
} from '@/lib/db';
import { config } from '@/lib/config';
import { uploadVideoFromPath } from '@/lib/storage';
import { downloadFile } from '@/lib/serverUtils';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const dynamic = 'force-dynamic';

const STUCK_THRESHOLD_MINUTES = 10;

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Try to recover a stuck regular job by checking FAL for its result.
 */
async function recoverJob(job: {
  id: string;
  falRequestId?: string;
  falEndpoint?: string;
  batchId?: string;
}): Promise<{ id: string; recovered: boolean; status: string }> {
  if (!job.falRequestId || !job.falEndpoint) {
    // No FAL request_id stored — can't recover, mark as failed
    await updateJob(job.id, {
      status: 'failed',
      step: 'Failed',
      error: 'Job timed out and no FAL request ID was stored for recovery.',
    });
    if (job.batchId) await updateBatchProgress(job.batchId).catch(() => {});
    return { id: job.id, recovered: false, status: 'failed_no_request_id' };
  }

  try {
    // Check FAL queue status
    const queueStatus = await fal.queue.status(job.falEndpoint, {
      requestId: job.falRequestId,
      logs: false,
    });
    const falStatus = queueStatus.status as string;

    if (falStatus === 'COMPLETED') {
      // FAL is done — fetch the result and process it
      const result = await fal.queue.result(job.falEndpoint, {
        requestId: job.falRequestId,
      });

      const videoData =
        (result.data as { video?: { url?: string } })?.video ??
        (result as { video?: { url?: string } }).video;

      if (!videoData?.url) {
        await updateJob(job.id, {
          status: 'failed',
          step: 'Failed',
          error: 'FAL completed but no video URL in response.',
        });
        if (job.batchId) await updateBatchProgress(job.batchId).catch(() => {});
        return { id: job.id, recovered: false, status: 'no_video_url' };
      }

      // Download and upload the result
      const tempDir = getTempDir();
      const tempPath = path.join(tempDir, `recover-${job.id}.mp4`);
      try {
        await downloadFile(videoData.url, tempPath);
        const { filename, url } = await uploadVideoFromPath(tempPath, `result-${job.id}.mp4`);

        await createMediaFile({
          filename,
          originalName: `result-${job.id}.mp4`,
          fileType: 'video',
          gcsUrl: url,
          fileSize: fs.statSync(tempPath).size,
          mimeType: 'video/mp4',
          jobId: job.id,
        });

        await updateJob(job.id, {
          status: 'completed',
          step: 'Done! (recovered)',
          outputUrl: url,
          completedAt: new Date().toISOString(),
        });

        if (job.batchId) await updateBatchProgress(job.batchId).catch(() => {});
        return { id: job.id, recovered: true, status: 'completed' };
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } else if (falStatus === 'IN_QUEUE' || falStatus === 'IN_PROGRESS') {
      // FAL is still working — update the step message but leave job as processing
      await updateJob(job.id, {
        step: `AI is still generating (${falStatus === 'IN_QUEUE' ? 'queued' : 'in progress'})...`,
      });
      return { id: job.id, recovered: false, status: `fal_${falStatus.toLowerCase()}` };
    } else {
      // FAL failed or unknown status
      await updateJob(job.id, {
        status: 'failed',
        step: 'Failed',
        error: `FAL job status: ${falStatus}`,
      });
      if (job.batchId) await updateBatchProgress(job.batchId).catch(() => {});
      return { id: job.id, recovered: false, status: `fal_${falStatus}` };
    }
  } catch (err) {
    console.error(`[Recovery] Error recovering job ${job.id}:`, err);
    // Don't mark as failed — the FAL request might still be valid
    return {
      id: job.id,
      recovered: false,
      status: `error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Try to recover a stuck template job by checking FAL for its result.
 * For template jobs, we can only recover if the FAL step was the last one
 * or if no further steps need the intermediate result.
 */
async function recoverTemplateJob(job: {
  id: string;
  falRequestId?: string;
  falEndpoint?: string;
  currentStep: number;
  totalSteps: number;
  pipelineBatchId?: string;
  stepResults?: { stepId: string; type: string; label: string; outputUrl: string }[];
}): Promise<{ id: string; recovered: boolean; status: string }> {
  if (!job.falRequestId || !job.falEndpoint) {
    await updateTemplateJob(job.id, {
      status: 'failed',
      step: 'Failed',
      error: 'Job timed out and no FAL request ID was stored for recovery.',
    });
    if (job.pipelineBatchId) await updatePipelineBatchProgress(job.pipelineBatchId).catch(() => {});
    return { id: job.id, recovered: false, status: 'failed_no_request_id' };
  }

  try {
    const queueStatus = await fal.queue.status(job.falEndpoint, {
      requestId: job.falRequestId,
      logs: false,
    });
    const falStatus = queueStatus.status as string;

    if (falStatus === 'COMPLETED') {
      const result = await fal.queue.result(job.falEndpoint, {
        requestId: job.falRequestId,
      });

      const videoData =
        (result.data as { video?: { url?: string } })?.video ??
        (result as { video?: { url?: string } }).video;

      if (!videoData?.url) {
        await updateTemplateJob(job.id, {
          status: 'failed',
          step: 'Failed',
          error: 'FAL completed but no video URL in response.',
        });
        if (job.pipelineBatchId) await updatePipelineBatchProgress(job.pipelineBatchId).catch(() => {});
        return { id: job.id, recovered: false, status: 'no_video_url' };
      }

      // Download FAL result and upload to GCS
      const tempDir = getTempDir();
      const tempPath = path.join(tempDir, `recover-tpl-${job.id}.mp4`);
      try {
        await downloadFile(videoData.url, tempPath);
        const { url: outputUrl } = await uploadVideoFromPath(tempPath, `template-${job.id}-recovered.mp4`);

        // Build step results
        const stepResults = [...(job.stepResults || [])];
        stepResults.push({
          stepId: `recovered-step-${job.currentStep}`,
          type: 'video-generation',
          label: 'Video Generation (recovered)',
          outputUrl,
        });

        // If this was the last step (or only step), mark as completed
        const isLastStep = job.currentStep >= job.totalSteps - 1;
        if (isLastStep) {
          await updateTemplateJob(job.id, {
            status: 'completed',
            step: 'Done! (recovered)',
            outputUrl,
            stepResults,
            completedAt: new Date().toISOString(),
          });
          if (job.pipelineBatchId) await updatePipelineBatchProgress(job.pipelineBatchId).catch(() => {});
          return { id: job.id, recovered: true, status: 'completed' };
        } else {
          // There are more steps — we can't easily resume the pipeline
          // Mark the FAL step as done and mark job as failed with info
          await updateTemplateJob(job.id, {
            status: 'failed',
            step: 'Failed',
            stepResults,
            error: `FAL completed but Lambda timed out. Video saved but remaining pipeline steps (${job.currentStep + 1}/${job.totalSteps}) could not be processed. Please retry the job.`,
          });
          if (job.pipelineBatchId) await updatePipelineBatchProgress(job.pipelineBatchId).catch(() => {});
          return { id: job.id, recovered: false, status: 'partial_recovery' };
        }
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } else if (falStatus === 'IN_QUEUE' || falStatus === 'IN_PROGRESS') {
      await updateTemplateJob(job.id, {
        step: `AI is still generating (${falStatus === 'IN_QUEUE' ? 'queued' : 'in progress'})...`,
      });
      return { id: job.id, recovered: false, status: `fal_${falStatus.toLowerCase()}` };
    } else {
      await updateTemplateJob(job.id, {
        status: 'failed',
        step: 'Failed',
        error: `FAL job status: ${falStatus}`,
      });
      if (job.pipelineBatchId) await updatePipelineBatchProgress(job.pipelineBatchId).catch(() => {});
      return { id: job.id, recovered: false, status: `fal_${falStatus}` };
    }
  } catch (err) {
    console.error(`[Recovery] Error recovering template job ${job.id}:`, err);
    return {
      id: job.id,
      recovered: false,
      status: `error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function POST() {
  try {
    await initDatabase();

    if (!config.FAL_KEY) {
      return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
    }

    fal.config({ credentials: config.FAL_KEY });

    // Find stuck jobs
    const [stuckJobs, stuckTemplateJobs] = await Promise.all([
      getStuckJobs(STUCK_THRESHOLD_MINUTES),
      getStuckTemplateJobs(STUCK_THRESHOLD_MINUTES),
    ]);

    if (stuckJobs.length === 0 && stuckTemplateJobs.length === 0) {
      return NextResponse.json({ message: 'No stuck jobs found', results: [] });
    }

    console.log(`[Recovery] Found ${stuckJobs.length} stuck jobs, ${stuckTemplateJobs.length} stuck template jobs`);

    // Process recovery for all stuck jobs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await Promise.allSettled([
      ...stuckJobs.map((job: any) => recoverJob(job)),
      ...stuckTemplateJobs.map((job: any) => recoverTemplateJob(job)),
    ]);

    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { recovered: false, status: 'promise_rejected' }
    );

    return NextResponse.json({
      message: `Processed ${summary.length} stuck jobs`,
      recovered: summary.filter((r) => r.recovered).length,
      results: summary,
    });
  } catch (err) {
    console.error('[Recovery] Error:', err);
    return NextResponse.json(
      { error: 'Recovery failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
