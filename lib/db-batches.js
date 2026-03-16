import { eq, desc } from 'drizzle-orm';
import { db } from './drizzle';
import { batches } from './schema';
import { sql as rawSql } from './db-client';

export async function createBatch({ name, modelId, imageSelectionMode, selectedImageIds, totalJobs }) {
  const result = await db.insert(batches).values({
    name,
    modelId: modelId || null,
    imageSelectionMode: imageSelectionMode || 'model',
    selectedImageIds: selectedImageIds || null,
    totalJobs: totalJobs || 0,
  }).returning();
  return result[0];
}

export async function getBatch(id) {
  const result = await db.select().from(batches).where(eq(batches.id, id));
  return result[0] || null;
}

export async function getAllBatches() {
  return db.select().from(batches).orderBy(desc(batches.createdAt));
}

export async function updateBatch(id, updates) {
  const { status, completedJobs, failedJobs, completedAt } = updates;

  const setObj = {};
  if (status) setObj.status = status;
  if (completedJobs != null) setObj.completedJobs = completedJobs;
  if (failedJobs != null) setObj.failedJobs = failedJobs;
  if (completedAt) setObj.completedAt = completedAt;

  if (Object.keys(setObj).length === 0) return null;

  const result = await db.update(batches).set(setObj).where(eq(batches.id, id)).returning();
  return result[0] || null;
}

export async function deleteBatch(id) {
  await db.delete(batches).where(eq(batches.id, id));
}

export async function updateBatchProgress(batchId) {
  const stats = await rawSql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) as total
    FROM jobs WHERE batch_id = ${batchId}
  `;

  const { completed, failed, total } = stats[0];
  const completedNum = parseInt(completed, 10) || 0;
  const failedNum = parseInt(failed, 10) || 0;
  const totalNum = parseInt(total, 10) || 0;

  let status = 'processing';
  let completedAt = null;

  if (completedNum + failedNum >= totalNum) {
    completedAt = new Date().toISOString();
    if (failedNum === 0) {
      status = 'completed';
    } else if (completedNum === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }
  }

  return updateBatch(batchId, {
    status,
    completedJobs: completedNum,
    failedJobs: failedNum,
    completedAt,
  });
}
