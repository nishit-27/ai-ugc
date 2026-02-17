import { sql } from './db-client';
import { transformPipelineBatch } from './db-transforms';

export async function createPipelineBatch({ name, pipeline, totalJobs, isMaster, masterConfig, createdBy }) {
  const result = await sql`
    INSERT INTO pipeline_batches (name, pipeline, total_jobs, status, is_master, master_config, created_by)
    VALUES (${name}, ${JSON.stringify(pipeline)}, ${totalJobs || 0}, 'pending', ${isMaster || false}, ${masterConfig ? JSON.stringify(masterConfig) : null}, ${createdBy || null})
    RETURNING *
  `;
  return transformPipelineBatch(result[0]);
}

export async function getPipelineBatch(id) {
  const result = await sql`SELECT * FROM pipeline_batches WHERE id = ${id}`;
  return result[0] ? transformPipelineBatch(result[0]) : null;
}

export async function getAllPipelineBatches() {
  const result = await sql`SELECT * FROM pipeline_batches ORDER BY created_at DESC`;
  return result.map(transformPipelineBatch);
}

export async function updatePipelineBatch(id, updates) {
  const { status, completedJobs, failedJobs, totalJobs, completedAt } = updates;
  const result = await sql`
    UPDATE pipeline_batches SET
      status = COALESCE(${status || null}, status),
      completed_jobs = COALESCE(${completedJobs ?? null}, completed_jobs),
      failed_jobs = COALESCE(${failedJobs ?? null}, failed_jobs),
      total_jobs = COALESCE(${totalJobs ?? null}, total_jobs),
      completed_at = COALESCE(${completedAt || null}, completed_at)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformPipelineBatch(result[0]) : null;
}

export async function updateMasterConfig(id, masterConfig) {
  const result = await sql`
    UPDATE pipeline_batches SET master_config = ${JSON.stringify(masterConfig)}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformPipelineBatch(result[0]) : null;
}

export async function deletePipelineBatch(id) {
  await sql`DELETE FROM pipeline_batches WHERE id = ${id}`;
}

export async function updatePipelineBatchProgress(batchId) {
  const stats = await sql`
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
