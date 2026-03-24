import { db } from './drizzle';
import { templateJobs, templateJobPostLocks } from './schema';
import { eq, asc, desc, sql, isNotNull, lt } from 'drizzle-orm';
import { sql as rawSql } from './db-client';
import { fixOutputUrl, fixStepResultUrls } from './db-transforms';
import { coerceTimestampValue } from './db-timestamps';

function applyUrlFixes(row) {
  if (!row) return null;
  return {
    ...row,
    outputUrl: fixOutputUrl(row.outputUrl),
    stepResults: fixStepResultUrls(Array.isArray(row.stepResults) ? row.stepResults : []),
  };
}

export async function createTemplateJob({
  name,
  pipeline,
  videoSource,
  tiktokUrl,
  videoUrl,
  pipelineBatchId,
  modelId,
  regeneratedFrom = null,
  createdBy,
}) {
  const totalSteps = pipeline.filter((s) => s.enabled).length;
  const [row] = await db.insert(templateJobs).values({
    name,
    pipeline,
    totalSteps,
    videoSource: videoSource || 'tiktok',
    tiktokUrl: tiktokUrl || null,
    videoUrl: videoUrl || null,
    pipelineBatchId: pipelineBatchId || null,
    modelId: modelId || null,
    regeneratedFrom: regeneratedFrom || null,
    createdBy: createdBy || null,
  }).returning();
  return applyUrlFixes(row);
}

export async function getTemplateJob(id) {
  const [row] = await db.select().from(templateJobs).where(eq(templateJobs.id, id));
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
  const { status, currentStep, step, outputUrl, stepResults, error, completedAt, videoUrl, videoSource, falRequestId, falEndpoint } = updates;
  const hasKey = (k) => Object.prototype.hasOwnProperty.call(updates, k);

  const set = {};
  if (hasKey('status') && status) set.status = status;
  if (currentStep !== undefined && currentStep !== null) set.currentStep = currentStep;
  if (hasKey('step') && step) set.step = step;
  if (hasKey('outputUrl')) set.outputUrl = outputUrl || null;
  if (hasKey('stepResults')) set.stepResults = stepResults || null;
  if (error !== undefined) set.error = error;
  if (hasKey('completedAt')) set.completedAt = coerceTimestampValue(completedAt, 'completedAt');
  if (videoUrl) set.videoUrl = videoUrl;
  if (videoSource) set.videoSource = videoSource;
  if (falRequestId) set.falRequestId = falRequestId;
  if (falEndpoint) set.falEndpoint = falEndpoint;

  if (Object.keys(set).length === 0) return getTemplateJob(id);

  const [row] = await db.update(templateJobs).set(set).where(eq(templateJobs.id, id)).returning();
  return applyUrlFixes(row);
}

export async function getTemplateJobsByBatchId(batchId) {
  const rows = await db.select().from(templateJobs)
    .where(eq(templateJobs.pipelineBatchId, batchId))
    .orderBy(asc(templateJobs.createdAt));
  return rows.map(applyUrlFixes);
}

export async function getStuckTemplateJobs(minutesThreshold = 10) {
  const rows = await db.select().from(templateJobs)
    .where(sql`${templateJobs.status} = 'processing' AND ${templateJobs.createdAt} < NOW() - INTERVAL '1 minute' * ${minutesThreshold}`)
    .orderBy(asc(templateJobs.createdAt));
  return rows.map(applyUrlFixes);
}

export async function getStuckQueuedTemplateJobs(minutesThreshold = 10) {
  const rows = await db.select().from(templateJobs)
    .where(sql`${templateJobs.status} = 'queued' AND ${templateJobs.createdAt} < NOW() - INTERVAL '1 minute' * ${minutesThreshold}`)
    .orderBy(asc(templateJobs.createdAt));
  return rows.map(applyUrlFixes);
}

export async function getTemplateJobByFalRequestId(requestId) {
  const [row] = await db.select().from(templateJobs)
    .where(eq(templateJobs.falRequestId, requestId))
    .limit(1);
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
  const [row] = await db.update(templateJobs)
    .set({ postStatus })
    .where(eq(templateJobs.id, id))
    .returning();
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

  const [row] = await db.update(templateJobs).set(set).where(eq(templateJobs.id, id)).returning();
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
  const result = await rawSql`
    UPDATE template_jobs
    SET status = 'failed',
        step = 'Failed',
        error = 'Marked as failed — job was stuck in queue and never started processing.'
    WHERE pipeline_batch_id = ${batchId}
      AND status = 'queued'
    RETURNING id
  `;
  return result.length;
}

export async function getTemplateJobsWithPipelineStep(stepType) {
  return rawSql`
    SELECT id FROM template_jobs
    WHERE pipeline @> ${JSON.stringify([{ type: stepType }])}::jsonb
  `;
}
