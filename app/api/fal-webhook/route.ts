import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { fal } from '@fal-ai/client';
import {
  initDatabase,
  getJobByFalRequestId,
  getTemplateJobByFalRequestId,
  getTemplateJob,
  updateJob,
  updateTemplateJob,
  createMediaFile,
  updateBatchProgress,
  updatePipelineBatchProgress,
} from '@/lib/db';
import { config } from '@/lib/config';
import { uploadVideoFromPath } from '@/lib/storage';
import { downloadFile } from '@/lib/serverUtils';
import { getStepLabel, processTemplateJob, triggerTemplateJobProcessing } from '@/lib/processTemplateJob';
import { canFinalizeTemplateJobFromPersistedSteps, getFinalTemplateJobOutputUrl } from '@/lib/templateJobFinalization';
import { cleanupTempWorkspace, createTempWorkspace } from '@/lib/tempWorkspace';
import type { MiniAppStep } from '@/types';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Handle a completed regular job from the webhook payload.
 */
async function handleRegularJob(
  job: { id: string; status: string; batchId?: string },
  videoUrl: string
): Promise<void> {
  if (job.status === 'completed' || job.status === 'failed') {
    console.log(`[Webhook] Job ${job.id} already ${job.status}, skipping`);
    return;
  }

  const tempDir = createTempWorkspace(`webhook-job-${job.id}`);
  const tempPath = path.join(tempDir, `webhook-${job.id}.mp4`);

  try {
    await updateJob(job.id, { step: 'Downloading result (webhook)...' });
    await downloadFile(videoUrl, tempPath);

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
      step: 'Done!',
      outputUrl: url,
      completedAt: new Date(),
    });

    console.log(`[Webhook] Job ${job.id} completed via webhook`);

    if (job.batchId) {
      await updateBatchProgress(job.batchId).catch((e: unknown) => {
        console.error(`[Webhook] Failed to update batch progress for ${job.batchId}:`, e);
      });
    }
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
    cleanupTempWorkspace(tempDir);
  }
}

/**
 * Handle a completed template job step from the webhook payload.
 * Downloads the FAL result, saves it, then continues the remaining pipeline steps.
 */
async function handleTemplateJob(
  job: {
    id: string;
    status: string;
    currentStep: number;
    totalSteps: number;
    pipeline: MiniAppStep[];
    stepResults?: { stepId: string; type: string; label: string; outputUrl: string }[];
    pipelineBatchId?: string;
  },
  videoUrl: string
): Promise<void> {
  if (job.status === 'completed' || job.status === 'failed') {
    console.log(`[Webhook] Template job ${job.id} already ${job.status}, skipping`);
    return;
  }

  const tempDir = createTempWorkspace(`webhook-template-${job.id}`);
  const enabledSteps = job.pipeline.filter((s: MiniAppStep) => s.enabled);
  const currentVideoPath = path.join(tempDir, `webhook-tpl-${job.id}.mp4`);

  try {
    if (canFinalizeTemplateJobFromPersistedSteps(job.currentStep, enabledSteps.length, job.stepResults)) {
      const persistedOutputUrl = getFinalTemplateJobOutputUrl(job.stepResults);
      if (!persistedOutputUrl) {
        throw new Error(`Template job ${job.id} has persisted step results but no final output URL`);
      }

      await updateTemplateJob(job.id, {
        status: 'completed',
        step: 'Done!',
        outputUrl: persistedOutputUrl,
        completedAt: new Date(),
      });

      if (job.pipelineBatchId) {
        await updatePipelineBatchProgress(job.pipelineBatchId).catch((e: unknown) => {
          console.error(`[Webhook] Failed to update pipeline batch progress for ${job.pipelineBatchId}:`, e);
        });
      }
      return;
    }

    // Download the FAL result
    await downloadFile(videoUrl, currentVideoPath);

    // Upload to GCS and record the step result
    const { url: stepUrl } = await uploadVideoFromPath(currentVideoPath, `template-${job.id}-step-${job.currentStep}.mp4`);

    const currentStepDef = enabledSteps[job.currentStep];
    const stepLabel = currentStepDef ? getStepLabel(currentStepDef) : 'Video Generation';

    const stepResults = [...(job.stepResults || [])];
    stepResults.push({
      stepId: currentStepDef?.id || `webhook-step-${job.currentStep}`,
      type: currentStepDef?.type || 'video-generation',
      label: stepLabel,
      outputUrl: stepUrl,
    });

    // Persist recovered step immediately
    await updateTemplateJob(job.id, {
      currentStep: job.currentStep + 1,
      step: `Step ${job.currentStep + 1}/${enabledSteps.length}: ${stepLabel} — done (webhook)`,
      stepResults,
      falRequestId: null,
      falEndpoint: null,
      error: null,
    });

    const nextStepIndex = job.currentStep + 1;
    if (nextStepIndex < enabledSteps.length) {
      console.log(`[Webhook] Continuing pipeline for ${job.id} from step ${nextStepIndex + 1}/${enabledSteps.length}`);
      const triggered = await triggerTemplateJobProcessing(job.id, nextStepIndex);
      if (!triggered) {
        console.warn(`[Webhook] Failed to trigger fresh continuation for ${job.id}; falling back to inline processing.`);
        await processTemplateJob(job.id, nextStepIndex);
      }
      return;
    }

    const finalUrl = stepResults[stepResults.length - 1].outputUrl;
    await updateTemplateJob(job.id, {
      status: 'completed',
      step: 'Done!',
      outputUrl: finalUrl,
      completedAt: new Date(),
      error: null,
      falRequestId: null,
      falEndpoint: null,
    });

    console.log(`[Webhook] Template job ${job.id} completed via webhook`);

    if (job.pipelineBatchId) {
      await updatePipelineBatchProgress(job.pipelineBatchId).catch((e: unknown) => {
        console.error(`[Webhook] Failed to update pipeline batch progress for ${job.pipelineBatchId}:`, e);
      });
    }
  } catch (error) {
    console.error(`[Webhook] Error processing template job ${job.id}:`, error);
    await updateTemplateJob(job.id, {
      status: 'failed',
      step: 'Failed',
      error: error instanceof Error ? error.message : String(error),
    });

    const failedJob = await getTemplateJob(job.id);
    if (failedJob?.pipelineBatchId) {
      await updatePipelineBatchProgress(failedJob.pipelineBatchId).catch(() => {});
    }
  } finally {
    try { fs.unlinkSync(currentVideoPath); } catch {}
    cleanupTempWorkspace(tempDir);
  }
}

export async function POST(request: NextRequest) {
  // Parse body before responding — after() can't access the request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestId = body.request_id as string | undefined;
  const status = body.status as string | undefined;

  if (!requestId) {
    return NextResponse.json({ error: 'Missing request_id' }, { status: 400 });
  }

  console.log(`[Webhook] Received callback for request_id=${requestId}, status=${status}`);

  // Respond 200 immediately, do the heavy work in after()
  // FAL has a 15s delivery timeout and retries 10x over 2h
  after(async () => {
    try {
      await initDatabase();

      if (status !== 'OK') {
        // FAL reported an error — mark the job as failed
        const errorPayload = body.payload as { detail?: string } | undefined;
        const errorMsg = errorPayload?.detail || `FAL webhook error: ${status}`;

        const job = await getJobByFalRequestId(requestId);
        if (job) {
          if (job.status === 'completed' || job.status === 'failed') return;
          await updateJob(job.id, {
            status: 'failed',
            step: 'Failed',
            error: errorMsg,
          });
          if (job.batchId) await updateBatchProgress(job.batchId).catch(() => {});
          console.log(`[Webhook] Job ${job.id} failed via webhook: ${errorMsg}`);
          return;
        }

        const templateJob = await getTemplateJobByFalRequestId(requestId);
        if (templateJob) {
          if (templateJob.status === 'completed' || templateJob.status === 'failed') return;
          await updateTemplateJob(templateJob.id, {
            status: 'failed',
            step: 'Failed',
            error: errorMsg,
          });
          if (templateJob.pipelineBatchId) await updatePipelineBatchProgress(templateJob.pipelineBatchId).catch(() => {});
          console.log(`[Webhook] Template job ${templateJob.id} failed via webhook: ${errorMsg}`);
        }
        return;
      }

      // Extract video URL from FAL payload
      const payload = body.payload as { video?: { url?: string } } | undefined;
      const videoUrl = payload?.video?.url;
      if (!videoUrl) {
        console.error(`[Webhook] No video URL in payload for request_id=${requestId}`);
        return;
      }

      if (config.FAL_KEY) {
        fal.config({ credentials: config.FAL_KEY });
      }

      // Look up the job by fal_request_id
      const job = await getJobByFalRequestId(requestId);
      if (job) {
        await handleRegularJob(job, videoUrl);
        return;
      }

      const templateJob = await getTemplateJobByFalRequestId(requestId);
      if (templateJob) {
        await handleTemplateJob(templateJob, videoUrl);
        return;
      }

      console.warn(`[Webhook] No job found for request_id=${requestId}`);
    } catch (error) {
      console.error(`[Webhook] Error processing callback for request_id=${requestId}:`, error);
    }
  });

  return NextResponse.json({ ok: true });
}
