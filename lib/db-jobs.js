import { sql } from './db-client';
import { transformJob } from './db-transforms';

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
  const result = await sql`
    INSERT INTO jobs (tiktok_url, video_url, video_source, image_url, custom_prompt, max_seconds, batch_id, status, step, created_by)
    VALUES (${tiktokUrl || null}, ${videoUrl || null}, ${videoSource}, ${imageUrl}, ${customPrompt || null}, ${maxSeconds || 10}, ${batchId || null}, ${status}, ${step}, ${createdBy || null})
    RETURNING *
  `;
  return transformJob(result[0]);
}

export async function getJob(id) {
  const result = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  return result[0] ? transformJob(result[0]) : null;
}

export async function getAllJobs() {
  const result = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
  return result.map(transformJob);
}

export async function updateJob(id, updates) {
  const { status, step, outputUrl, error, completedAt, falRequestId, falEndpoint, videoUrl, videoSource } = updates;

  const result = await sql`
    UPDATE jobs SET
      status = COALESCE(${status || null}, status),
      step = COALESCE(${step || null}, step),
      output_url = COALESCE(${outputUrl || null}, output_url),
      error = COALESCE(${error || null}, error),
      completed_at = COALESCE(${completedAt || null}, completed_at),
      fal_request_id = COALESCE(${falRequestId || null}, fal_request_id),
      fal_endpoint = COALESCE(${falEndpoint || null}, fal_endpoint),
      video_url = COALESCE(${videoUrl || null}, video_url),
      video_source = COALESCE(${videoSource || null}, video_source)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformJob(result[0]) : null;
}

export async function deleteJob(id) {
  await sql`DELETE FROM jobs WHERE id = ${id}`;
}

export async function getJobsByBatchId(batchId) {
  const result = await sql`SELECT * FROM jobs WHERE batch_id = ${batchId} ORDER BY created_at ASC`;
  return result.map(transformJob);
}

export async function getStuckJobs(minutesThreshold = 10) {
  const result = await sql`
    SELECT * FROM jobs
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '1 minute' * ${minutesThreshold}
    ORDER BY created_at ASC
  `;
  return result.map(transformJob);
}

export async function getJobByFalRequestId(requestId) {
  const result = await sql`SELECT * FROM jobs WHERE fal_request_id = ${requestId} LIMIT 1`;
  return result[0] ? transformJob(result[0]) : null;
}

export async function getCompletedJobVideos() {
  const result = await sql`
    SELECT id, output_url, created_at, completed_at, created_by
    FROM jobs
    WHERE status = 'completed' AND output_url IS NOT NULL
    ORDER BY COALESCE(completed_at, created_at) DESC
  `;
  return result.map(transformJob);
}
