import { db } from './drizzle';
import { pipelineBatches } from './schema';
import { eq, desc } from 'drizzle-orm';
import { sql as rawSql } from './db-client';

export async function createPipelineBatch({ name, pipeline, totalJobs, isMaster, masterConfig, createdBy }) {
  const [row] = await db.insert(pipelineBatches).values({
    name,
    pipeline,
    totalJobs: totalJobs || 0,
    status: 'pending',
    isMaster: isMaster || false,
    masterConfig: masterConfig || null,
    createdBy: createdBy || null,
  }).returning();
  return row;
}

export async function getPipelineBatch(id) {
  const [row] = await db.select().from(pipelineBatches).where(eq(pipelineBatches.id, id));
  return row || null;
}

export async function getAllPipelineBatches() {
  return db.select().from(pipelineBatches).orderBy(desc(pipelineBatches.createdAt));
}

export async function updatePipelineBatch(id, updates) {
  const { status, completedJobs, failedJobs, totalJobs, completedAt } = updates;
  const set = {};
  if (status) set.status = status;
  if (completedJobs !== undefined && completedJobs !== null) set.completedJobs = completedJobs;
  if (failedJobs !== undefined && failedJobs !== null) set.failedJobs = failedJobs;
  if (totalJobs !== undefined && totalJobs !== null) set.totalJobs = totalJobs;
  if (completedAt) set.completedAt = completedAt;

  if (Object.keys(set).length === 0) return getPipelineBatch(id);

  const [row] = await db.update(pipelineBatches).set(set).where(eq(pipelineBatches.id, id)).returning();
  return row || null;
}

export async function updateMasterConfig(id, masterConfig) {
  const [row] = await db.update(pipelineBatches)
    .set({ masterConfig })
    .where(eq(pipelineBatches.id, id))
    .returning();
  return row || null;
}

export async function deletePipelineBatch(id) {
  await db.delete(pipelineBatches).where(eq(pipelineBatches.id, id));
}

export async function updatePipelineBatchProgress(batchId) {
  const stats = await rawSql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) as total
    FROM template_jobs WHERE pipeline_batch_id = ${batchId}
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

  return updatePipelineBatch(batchId, {
    status,
    totalJobs: totalNum,
    completedJobs: completedNum,
    failedJobs: failedNum,
    completedAt,
  });
}
