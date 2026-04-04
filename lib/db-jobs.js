import { eq, and, lt, isNotNull, desc, asc, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { jobs } from './schema';
import { fixOutputUrl } from './db-transforms';
import { coerceTimestampValue } from './db-timestamps';

function applyUrlFix(row) {
  if (!row) return null;
  return { ...row, outputUrl: fixOutputUrl(row.outputUrl) };
}

export async function createJob({
  tiktokUrl,
  videoUrl,
  videoSource = 'tiktok',
  imageUrl,
  customPrompt,
  maxSeconds,
  batchId,
  status = 'processing',
  step = 'Starting...',
  createdBy,
}) {
  const result = await db.insert(jobs).values({
    tiktokUrl: tiktokUrl || null,
    videoUrl: videoUrl || null,
    videoSource,
    imageUrl,
    customPrompt: customPrompt || null,
    maxSeconds: maxSeconds || 10,
    batchId: batchId || null,
    status,
    step,
    createdBy: createdBy || null,
  }).returning();
  return applyUrlFix(result[0]);
}

export async function getJob(id) {
  const result = await db.select().from(jobs).where(eq(jobs.id, id));
  return result[0] ? applyUrlFix(result[0]) : null;
}

export async function getAllJobs() {
  const result = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  return result.map(applyUrlFix);
}

export async function updateJob(id, updates) {
  const { status, step, outputUrl, error, completedAt, falRequestId, falEndpoint, videoUrl, videoSource } = updates;
  const hasKey = (k) => Object.prototype.hasOwnProperty.call(updates, k);

  const setObj = {};
  if (hasKey('status') && status) setObj.status = status;
  if (hasKey('step') && step) setObj.step = step;
  if (hasKey('outputUrl')) setObj.outputUrl = outputUrl || null;
  if (error !== undefined) setObj.error = error;
  if (hasKey('completedAt')) setObj.completedAt = coerceTimestampValue(completedAt, 'completedAt');
  if (hasKey('falRequestId')) setObj.falRequestId = falRequestId || null;
  if (hasKey('falEndpoint')) setObj.falEndpoint = falEndpoint || null;
  if (hasKey('videoUrl')) setObj.videoUrl = videoUrl || null;
  if (hasKey('videoSource')) setObj.videoSource = videoSource || null;

  if (Object.keys(setObj).length === 0) return null;

  const result = await db.update(jobs).set(setObj).where(eq(jobs.id, id)).returning();
  return result[0] ? applyUrlFix(result[0]) : null;
}

export async function deleteJob(id) {
  await db.delete(jobs).where(eq(jobs.id, id));
}

export async function getJobsByBatchId(batchId) {
  const result = await db.select().from(jobs).where(eq(jobs.batchId, batchId)).orderBy(asc(jobs.createdAt));
  return result.map(applyUrlFix);
}

export async function getStuckJobs(minutesThreshold = 10) {
  const result = await db.select().from(jobs).where(
    and(
      eq(jobs.status, 'processing'),
      lt(jobs.createdAt, sql`NOW() - INTERVAL '1 minute' * ${minutesThreshold}`)
    )
  ).orderBy(asc(jobs.createdAt));
  return result.map(applyUrlFix);
}

export async function getJobByFalRequestId(requestId) {
  const result = await db.select().from(jobs).where(eq(jobs.falRequestId, requestId)).limit(1);
  return result[0] ? applyUrlFix(result[0]) : null;
}

export async function getCompletedJobVideos() {
  const result = await db.select({
    id: jobs.id,
    outputUrl: jobs.outputUrl,
    createdAt: jobs.createdAt,
    completedAt: jobs.completedAt,
    createdBy: jobs.createdBy,
  }).from(jobs).where(
    and(
      eq(jobs.status, 'completed'),
      isNotNull(jobs.outputUrl)
    )
  ).orderBy(sql`COALESCE(${jobs.completedAt}, ${jobs.createdAt}) DESC`);
  return result.map(applyUrlFix);
}
