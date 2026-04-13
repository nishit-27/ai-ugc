import { db } from './drizzle';
import { templateJobs, templateJobPostLocks } from './schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { sql as rawSql } from './db-client';
import { fixOutputUrl, fixStepResultUrls } from './db-transforms';
import { coerceTimestampValue } from './db-timestamps';
import { retry } from './retry.ts';
import { normalizeTemplateJobStepResults } from './templateJobState.ts';

async function withTemplateJobDbRetry(label, fn) {
  return retry(fn, {
    retries: 3,
    delaysMs: [1000, 3000, 7000],
    onRetry: (error, attempt, delayMs) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TemplateJobDB] ${label} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${message}`);
    },
  });
}

function applyUrlFixes(row) {
  if (!row) return null;
  const safeRow = { ...row };
  delete safeRow.falRecoveryToken;
  const pipeline = Array.isArray(safeRow.pipeline) ? safeRow.pipeline : [];
  return {
    ...safeRow,
    outputUrl: fixOutputUrl(safeRow.outputUrl),
    stepResults: normalizeTemplateJobStepResults(
      pipeline,
      fixStepResultUrls(Array.isArray(safeRow.stepResults) ? safeRow.stepResults : []),
    ),
  };
}

/**
 * @param {{
 *   name: string;
 *   pipeline: import('@/types').MiniAppStep[];
 *   videoSource?: 'tiktok' | 'upload' | 'library';
 *   tiktokUrl?: string | null;
 *   videoUrl?: string | null;
 *   sourceTrimStart?: number | null;
 *   sourceTrimEnd?: number | null;
 *   pipelineBatchId?: string | null;
 *   modelId?: string | null;
 *   regeneratedFrom?: string | null;
 *   createdBy?: string | null;
 * }} params
 */
export async function createTemplateJob({
  name,
  pipeline,
  videoSource,
  tiktokUrl,
  videoUrl,
  sourceTrimStart = null,
  sourceTrimEnd = null,
  pipelineBatchId,
  modelId,
  regeneratedFrom = null,
  createdBy,
}) {
  const totalSteps = pipeline.filter((s) => s.enabled).length;
  const [row] = await withTemplateJobDbRetry(`create job ${name}`, () => db.insert(templateJobs).values({
    name,
    pipeline,
    totalSteps,
    videoSource: videoSource || 'tiktok',
    tiktokUrl: tiktokUrl || null,
    videoUrl: videoUrl || null,
    sourceTrimStart,
    sourceTrimEnd,
    pipelineBatchId: pipelineBatchId || null,
    modelId: modelId || null,
    regeneratedFrom: regeneratedFrom || null,
    createdBy: createdBy || null,
  }).returning());
  return applyUrlFixes(row);
}

export async function getTemplateJob(id) {
  const [row] = await withTemplateJobDbRetry(`load job ${id}`, () => db.select().from(templateJobs).where(eq(templateJobs.id, id)));
  return applyUrlFixes(row);
}

export async function deleteTemplateJob(id) {
  await db.delete(templateJobs).where(eq(templateJobs.id, id));
}

export async function getAllTemplateJobs() {
  const rows = await db.select().from(templateJobs).orderBy(desc(templateJobs.createdAt));
  return rows.map(applyUrlFixes);
}

export async function updateTemplateJob(id, updates) {
  const { status, currentStep, step, outputUrl, stepResults, error, completedAt, videoUrl, videoSource, falRequestId, falEndpoint, falRecoveryToken } = updates;
  const hasKey = (k) => Object.prototype.hasOwnProperty.call(updates, k);

  const set = {};
  if (hasKey('status') && status) set.status = status;
  if (currentStep !== undefined && currentStep !== null) set.currentStep = currentStep;
  if (hasKey('step') && step) set.step = step;
  if (hasKey('outputUrl')) set.outputUrl = outputUrl || null;
  if (hasKey('stepResults')) set.stepResults = stepResults || null;
  if (error !== undefined) set.error = error;
  if (hasKey('completedAt')) set.completedAt = coerceTimestampValue(completedAt, 'completedAt');
  if (hasKey('videoUrl')) set.videoUrl = videoUrl || null;
  if (hasKey('videoSource')) set.videoSource = videoSource || null;
  if (hasKey('falRequestId')) set.falRequestId = falRequestId || null;
  if (hasKey('falEndpoint')) set.falEndpoint = falEndpoint || null;
  if (hasKey('falRecoveryToken')) set.falRecoveryToken = falRecoveryToken || null;

  if (Object.keys(set).length === 0) return getTemplateJob(id);
  set.updatedAt = new Date();

  const [row] = await withTemplateJobDbRetry(`update job ${id}`, () =>
    db.update(templateJobs).set(set).where(eq(templateJobs.id, id)).returning()
  );
  return applyUrlFixes(row);
}

export async function getTemplateJobsByBatchId(batchId) {
  const rows = await withTemplateJobDbRetry(`load jobs for batch ${batchId}`, () => db.select().from(templateJobs)
    .where(eq(templateJobs.pipelineBatchId, batchId))
    .orderBy(asc(templateJobs.createdAt)));
  return rows.map(applyUrlFixes);
}

export async function getStuckTemplateJobs(minutesThreshold = 10) {
  const rows = await withTemplateJobDbRetry(`load stuck processing jobs older than ${minutesThreshold}m`, () => db.select().from(templateJobs)
    .where(sql`${templateJobs.status} = 'processing' AND ${templateJobs.updatedAt} < NOW() - INTERVAL '1 minute' * ${minutesThreshold}`)
    .orderBy(asc(templateJobs.updatedAt)));
  return rows.map(applyUrlFixes);
}

export async function getStuckQueuedTemplateJobs(minutesThreshold = 10) {
  const rows = await withTemplateJobDbRetry(`load stuck queued jobs older than ${minutesThreshold}m`, () => db.select().from(templateJobs)
    .where(sql`${templateJobs.status} = 'queued' AND ${templateJobs.updatedAt} < NOW() - INTERVAL '1 minute' * ${minutesThreshold}`)
    .orderBy(asc(templateJobs.updatedAt)));
  return rows.map(applyUrlFixes);
}

export async function getTemplateJobByFalRequestId(requestId) {
  const [row] = await withTemplateJobDbRetry(`load job by FAL request ${requestId}`, () => db.select().from(templateJobs)
    .where(eq(templateJobs.falRequestId, requestId))
    .limit(1));
  return applyUrlFixes(row);
}

export async function getTemplateJobByRecoveryToken(jobId, recoveryToken) {
  const [row] = await withTemplateJobDbRetry(`load job by recovery token ${jobId}`, () => db.select().from(templateJobs)
    .where(and(
      eq(templateJobs.id, jobId),
      eq(templateJobs.falRecoveryToken, recoveryToken),
    ))
    .limit(1));
  return applyUrlFixes(row);
}

export async function getCompletedTemplateJobVideos() {
  const rows = await db.select({
    id: templateJobs.id,
    outputUrl: templateJobs.outputUrl,
    createdAt: templateJobs.createdAt,
    completedAt: templateJobs.completedAt,
    createdBy: templateJobs.createdBy,
    modelId: templateJobs.modelId,
  }).from(templateJobs)
    .where(sql`${templateJobs.status} = 'completed' AND ${templateJobs.outputUrl} IS NOT NULL`)
    .orderBy(sql`COALESCE(${templateJobs.completedAt}, ${templateJobs.createdAt}) DESC`);
  return rows.map(row => ({
    ...row,
    outputUrl: fixOutputUrl(row.outputUrl),
  }));
}

export async function updateTemplateJobPostStatus(id, postStatus) {
  const [row] = await withTemplateJobDbRetry(`update post status for ${id}`, () => db.update(templateJobs)
    .set({ postStatus })
    .where(eq(templateJobs.id, id))
    .returning());
  return applyUrlFixes(row);
}

export async function updateTemplateJobOverrides(id, overrides) {
  const { captionOverride, publishModeOverride, scheduledForOverride, timezoneOverride } = overrides;
  const set = {};
  if (captionOverride !== undefined) set.captionOverride = captionOverride;
  if (publishModeOverride !== undefined) set.publishModeOverride = publishModeOverride;
  if (scheduledForOverride !== undefined) set.scheduledForOverride = scheduledForOverride;
  if (timezoneOverride !== undefined) set.timezoneOverride = timezoneOverride;

  if (Object.keys(set).length === 0) return getTemplateJob(id);

  const [row] = await withTemplateJobDbRetry(`update overrides for ${id}`, () =>
    db.update(templateJobs).set(set).where(eq(templateJobs.id, id)).returning()
  );
  return applyUrlFixes(row);
}

export async function acquireTemplateJobPostLock(id, staleMinutes = 3) {
  await db.delete(templateJobPostLocks).where(
    sql`${templateJobPostLocks.lockedAt} < NOW() - (${staleMinutes} * INTERVAL '1 minute')`
  );

  const result = await db.insert(templateJobPostLocks).values({
    jobId: id,
  }).onConflictDoNothing().returning();

  return result.length > 0;
}

export async function releaseTemplateJobPostLock(id) {
  await db.delete(templateJobPostLocks).where(eq(templateJobPostLocks.jobId, id));
}

export async function getTemplateJobsWithRelations(jobIds) {
  if (!jobIds || jobIds.length === 0) return [];
  return rawSql`
    SELECT tj.id, tj.name, tj.status AS job_status, tj.model_id, tj.pipeline_batch_id,
      tj.created_by, m.name AS model_name,
      pb.name AS batch_name, pb.is_master
    FROM template_jobs tj
    LEFT JOIN models m ON m.id = tj.model_id
    LEFT JOIN pipeline_batches pb ON pb.id = tj.pipeline_batch_id
    WHERE tj.id = ANY(${jobIds}::uuid[])
  `;
}

export async function failQueuedJobsInBatch(batchId) {
  const result = await withTemplateJobDbRetry(`fail queued jobs in batch ${batchId}`, () => rawSql`
    UPDATE template_jobs
    SET status = 'failed',
        step = 'Failed',
        error = 'Marked as failed — job was stuck in queue and never started processing.'
    WHERE pipeline_batch_id = ${batchId}
      AND status = 'queued'
    RETURNING id
  `);
  return result.length;
}

export async function failProcessingJobsInBatch(batchId) {
  const result = await withTemplateJobDbRetry(`fail processing jobs in batch ${batchId}`, () => rawSql`
    UPDATE template_jobs
    SET status = 'failed',
        step = 'Failed',
        error = 'Marked as failed manually from the batch page because the job appeared stuck in processing.'
    WHERE pipeline_batch_id = ${batchId}
      AND status = 'processing'
    RETURNING id
  `);
  return result.length;
}

export async function getTemplateJobsWithPipelineStep(stepType) {
  return rawSql`
    SELECT id FROM template_jobs
    WHERE pipeline @> ${JSON.stringify([{ type: stepType }])}::jsonb
  `;
}
