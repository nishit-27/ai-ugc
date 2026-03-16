import { sql as rawSql } from './db-client';
import { db } from './drizzle';
import { generationRequests } from './schema';
import { eq } from 'drizzle-orm';

export async function createGenerationRequest({
  type,
  provider,
  model,
  status = 'processing',
  cost = null,
  durationSeconds = null,
  error = null,
  metadata = null,
  createdBy = null,
  createdByEmail = null,
}) {
  const rows = await db.insert(generationRequests).values({
    type,
    provider,
    model,
    status,
    cost,
    durationSeconds,
    error,
    metadata,
    createdBy,
    createdByEmail,
  }).returning();
  return rows[0];
}

export async function updateGenerationRequest(id, { status, cost, durationSeconds, error }) {
  const set = {};
  if (status !== undefined && status !== null) set.status = status;
  if (cost !== undefined && cost !== null) set.cost = cost;
  if (durationSeconds !== undefined && durationSeconds !== null) set.durationSeconds = durationSeconds;
  if (error !== undefined && error !== null) set.error = error;

  if (Object.keys(set).length === 0) return;

  await db.update(generationRequests).set(set).where(eq(generationRequests.id, id));
}

export async function getGenerationRequestStats({ period = '30d', from = null, to = null } = {}) {
  const useCustom = from && to;
  const interval = period === '7d' ? '7 days' : period === '24h' ? '1 day' : '30 days';

  // Helper: builds WHERE clause fragment
  const whereClause = useCustom
    ? rawSql`created_at >= ${from}::date AND created_at < (${to}::date + interval '1 day')`
    : rawSql`created_at >= NOW() - ${interval}::interval`;

  const summary = await rawSql`
    SELECT
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0)::real AS total_cost,
      COALESCE(SUM(cost) FILTER (WHERE type = 'image' AND status = 'success'), 0)::real AS image_cost,
      COALESCE(SUM(cost) FILTER (WHERE type = 'video' AND status = 'success'), 0)::real AS video_cost,
      COUNT(*) FILTER (WHERE type = 'image')::int AS image_requests,
      COUNT(*) FILTER (WHERE type = 'video')::int AS video_requests
    FROM generation_requests
    WHERE ${whereClause}
  `;

  const daily = await rawSql`
    SELECT
      date_trunc('day', created_at)::date AS date,
      COUNT(*) FILTER (WHERE type = 'image' AND status = 'success')::int AS image_success,
      COUNT(*) FILTER (WHERE type = 'video' AND status = 'success')::int AS video_success,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost) FILTER (WHERE type = 'image' AND status = 'success'), 0)::real AS image_cost,
      COALESCE(SUM(cost) FILTER (WHERE type = 'video' AND status = 'success'), 0)::real AS video_cost
    FROM generation_requests
    WHERE ${whereClause}
    GROUP BY 1 ORDER BY 1
  `;

  const byModel = await rawSql`
    SELECT model, type, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0)::real AS total_cost
    FROM generation_requests
    WHERE ${whereClause}
    GROUP BY model, type ORDER BY total_cost DESC
  `;

  // By user
  const byUser = await rawSql`
    SELECT
      COALESCE(created_by_email, created_by, 'unknown') AS user_key,
      COALESCE(created_by, split_part(created_by_email, '@', 1)) AS display_name,
      created_by_email AS email,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0)::real AS total_cost,
      COUNT(*) FILTER (WHERE type = 'image')::int AS images,
      COUNT(*) FILTER (WHERE type = 'video')::int AS videos
    FROM generation_requests
    WHERE ${whereClause}
    GROUP BY created_by_email, created_by
    ORDER BY total_cost DESC
  `;

  // By job (from metadata->jobId)
  const byJob = await rawSql`
    SELECT
      metadata->>'jobId' AS job_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0)::real AS total_cost,
      COALESCE(SUM(duration_seconds) FILTER (WHERE status = 'success'), 0)::real AS total_duration
    FROM generation_requests
    WHERE ${whereClause} AND metadata->>'jobId' IS NOT NULL
    GROUP BY metadata->>'jobId'
    ORDER BY total_cost DESC
    LIMIT 50
  `;

  // Timeseries
  let bucket;
  if (useCustom) {
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    bucket = diffDays <= 2 ? 'hour' : 'day';
  } else {
    bucket = period === '24h' ? 'hour' : period === '7d' ? 'hour' : 'day';
  }

  const timeseries = await rawSql`
    SELECT date_trunc(${bucket}, created_at) AS ts,
      COUNT(*) FILTER (WHERE status = 'success')::int AS success,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
    FROM generation_requests
    WHERE ${whereClause}
    GROUP BY 1 ORDER BY 1
  `;

  // Recent requests
  const recent = await rawSql`
    SELECT id, type, model, status, cost, duration_seconds, error,
      created_by, created_by_email, metadata, created_at
    FROM generation_requests
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT 25
  `;

  return {
    summary: summary[0],
    daily,
    byModel,
    byUser,
    byJob,
    timeseries,
    recent,
  };
}
