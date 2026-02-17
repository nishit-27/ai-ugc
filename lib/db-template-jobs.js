import { sql } from './db-client';
import { transformTemplateJob } from './db-transforms';

export async function updateTemplateJobPostStatus(id, postStatus) {
  const result = await sql`
    UPDATE template_jobs SET post_status = ${postStatus}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformTemplateJob(result[0]) : null;
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
  const result = await sql`
    INSERT INTO template_jobs (name, pipeline, total_steps, video_source, tiktok_url, video_url, pipeline_batch_id, model_id, regenerated_from, created_by)
    VALUES (${name}, ${JSON.stringify(pipeline)}, ${totalSteps}, ${videoSource || 'tiktok'}, ${tiktokUrl || null}, ${videoUrl || null}, ${pipelineBatchId || null}, ${modelId || null}, ${regeneratedFrom || null}, ${createdBy || null})
    RETURNING *
  `;
  return transformTemplateJob(result[0]);
}

export async function getTemplateJob(id) {
  const result = await sql`SELECT * FROM template_jobs WHERE id = ${id}`;
  return result[0] ? transformTemplateJob(result[0]) : null;
}

export async function deleteTemplateJob(id) {
  await sql`DELETE FROM template_jobs WHERE id = ${id}`;
}

export async function getAllTemplateJobs() {
  const result = await sql`SELECT * FROM template_jobs ORDER BY created_at DESC`;
  return result.map(transformTemplateJob);
}

export async function updateTemplateJob(id, updates) {
  const { status, currentStep, step, outputUrl, stepResults, error, completedAt, videoUrl, videoSource, falRequestId, falEndpoint } = updates;
  const hasKey = (k) => Object.prototype.hasOwnProperty.call(updates, k);
  const result = await sql`
    UPDATE template_jobs SET
      status = COALESCE(${status || null}, status),
      current_step = COALESCE(${currentStep ?? null}, current_step),
      step = COALESCE(${step || null}, step),
      output_url = ${hasKey('outputUrl') ? (outputUrl || null) : sql`output_url`},
      step_results = ${hasKey('stepResults') ? (stepResults ? JSON.stringify(stepResults) : null) : sql`step_results`},
      error = ${error !== undefined ? error : null},
      completed_at = ${hasKey('completedAt') ? (completedAt || null) : sql`completed_at`},
      video_url = COALESCE(${videoUrl || null}, video_url),
      video_source = COALESCE(${videoSource || null}, video_source),
      fal_request_id = COALESCE(${falRequestId || null}, fal_request_id),
      fal_endpoint = COALESCE(${falEndpoint || null}, fal_endpoint)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformTemplateJob(result[0]) : null;
}

export async function getTemplateJobsByBatchId(batchId) {
  const result = await sql`SELECT * FROM template_jobs WHERE pipeline_batch_id = ${batchId} ORDER BY created_at ASC`;
  return result.map(transformTemplateJob);
}

export async function getStuckTemplateJobs(minutesThreshold = 10) {
  const result = await sql`
    SELECT * FROM template_jobs
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '1 minute' * ${minutesThreshold}
    ORDER BY created_at ASC
  `;
  return result.map(transformTemplateJob);
}

export async function getTemplateJobByFalRequestId(requestId) {
  const result = await sql`SELECT * FROM template_jobs WHERE fal_request_id = ${requestId} LIMIT 1`;
  return result[0] ? transformTemplateJob(result[0]) : null;
}

export async function updateTemplateJobOverrides(id, overrides) {
  const { captionOverride, publishModeOverride, scheduledForOverride, timezoneOverride } = overrides;
  const result = await sql`
    UPDATE template_jobs SET
      caption_override = ${captionOverride !== undefined ? captionOverride : sql`caption_override`},
      publish_mode_override = ${publishModeOverride !== undefined ? publishModeOverride : sql`publish_mode_override`},
      scheduled_for_override = ${scheduledForOverride !== undefined ? scheduledForOverride : sql`scheduled_for_override`},
      timezone_override = ${timezoneOverride !== undefined ? timezoneOverride : sql`timezone_override`}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformTemplateJob(result[0]) : null;
}
