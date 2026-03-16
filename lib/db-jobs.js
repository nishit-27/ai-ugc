import { eq, and, lt, isNotNull, desc, asc, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { jobs } from './schema';
import { fixOutputUrl } from './db-transforms';

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

  const setObj = {};
  if (status) setObj.status = status;
  if (step) setObj.step = step;
  if (outputUrl) setObj.outputUrl = outputUrl;
  if (error) setObj.error = error;
  if (completedAt) setObj.completedAt = completedAt;
  if (falRequestId) setObj.falRequestId = falRequestId;
  if (falEndpoint) setObj.falEndpoint = falEndpoint;
  if (videoUrl) setObj.videoUrl = videoUrl;
  if (videoSource) setObj.videoSource = videoSource;

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
