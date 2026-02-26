import { sql } from './db-client';

// ── Custom Variables CRUD ──

export async function createCustomVariable({ name, type, options, color }) {
  const rows = await sql`
    INSERT INTO custom_variables (name, type, options, color)
    VALUES (${name}, ${type}, ${options ? JSON.stringify(options) : null}, ${color || null})
    RETURNING *
  `;
  return rows[0] || null;
}

export async function getAllCustomVariables() {
  return sql`SELECT * FROM custom_variables ORDER BY created_at ASC`;
}

export async function getCustomVariable(id) {
  const rows = await sql`SELECT * FROM custom_variables WHERE id = ${id}`;
  return rows[0] || null;
}

export async function updateCustomVariable(id, { name, type, options, color }) {
  const rows = await sql`
    UPDATE custom_variables
    SET name = COALESCE(${name}, name),
        type = COALESCE(${type}, type),
        options = COALESCE(${options ? JSON.stringify(options) : null}, options),
        color = COALESCE(${color}, color)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] || null;
}

export async function deleteCustomVariable(id) {
  await sql`DELETE FROM custom_variables WHERE id = ${id}`;
}

// ── Job Variable Values ──

export async function getJobVariableValues(templateJobId) {
  return sql`
    SELECT jvv.*, cv.name AS variable_name, cv.type AS variable_type
    FROM job_variable_values jvv
    JOIN custom_variables cv ON cv.id = jvv.variable_id
    WHERE jvv.template_job_id = ${templateJobId}
  `;
}

export async function setJobVariableValues(templateJobId, values) {
  const results = [];
  for (const { variableId, value } of values) {
    const rows = await sql`
      INSERT INTO job_variable_values (template_job_id, variable_id, value)
      VALUES (${templateJobId}, ${variableId}, ${value})
      ON CONFLICT (template_job_id, variable_id)
      DO UPDATE SET value = ${value}
      RETURNING *
    `;
    if (rows[0]) results.push(rows[0]);
  }
  return results;
}

export async function deleteJobVariableValues(templateJobId) {
  await sql`DELETE FROM job_variable_values WHERE template_job_id = ${templateJobId}`;
}

// ── Pivot query ──

export async function getPivotData({ rowFields, columnFields, metric, aggregation, filters, dateFrom, dateTo }) {
  // Step 1: Get template jobs with model info
  const allJobs = await sql`
    SELECT
      tj.id,
      tj.status,
      tj.created_at,
      tj.model_id,
      COALESCE(m.name, 'No Model') AS model_name
    FROM template_jobs tj
    LEFT JOIN models m ON m.id = tj.model_id
  `;

  // Step 2: Get platform per job from posts table, with model_account_mappings fallback
  const jobPosts = await sql`
    SELECT DISTINCT p.job_id, p.platform, p.late_account_id, p.platform_post_url
    FROM posts p
    INNER JOIN template_jobs tj ON tj.id = p.job_id
    WHERE p.job_id IS NOT NULL
  `;
  const platformByJob = {};
  for (const p of jobPosts) {
    if (!platformByJob[p.job_id]) platformByJob[p.job_id] = [];
    if (!platformByJob[p.job_id].some(x => x.platform === p.platform)) {
      platformByJob[p.job_id].push({ platform: p.platform, late_account_id: p.late_account_id });
    }
  }
  // Fallback: for jobs with no posts, use model_account_mappings
  const accountMappings = await sql`
    SELECT DISTINCT mam.model_id, mam.platform
    FROM model_account_mappings mam
  `;
  const platformByModel = {};
  for (const m of accountMappings) {
    if (!platformByModel[m.model_id]) platformByModel[m.model_id] = [];
    platformByModel[m.model_id].push(m.platform);
  }

  // Step 3: Get all variable values
  const allValues = await sql`
    SELECT jvv.template_job_id, jvv.variable_id, jvv.value, cv.name AS variable_name
    FROM job_variable_values jvv
    JOIN custom_variables cv ON cv.id = jvv.variable_id
  `;

  // Step 4: Get per-video analytics via posts → analytics_accounts → analytics_media_items (URL matching)
  let jobAnalytics = {}; // job_id → { total_views, total_likes, ... }
  let jobPlatformAnalytics = {}; // `${job_id}:::${platform}` → { ... }
  if (metric && metric !== 'count') {
    const analytics = await sql`
      SELECT
        p.job_id,
        p.platform,
        COALESCE(SUM(ami.views), 0) AS total_views,
        COALESCE(SUM(ami.likes), 0) AS total_likes,
        COALESCE(SUM(ami.comments), 0) AS total_comments,
        COALESCE(SUM(ami.shares), 0) AS total_shares,
        COALESCE(AVG(ami.engagement_rate), 0) AS avg_engagement,
        COUNT(ami.id) AS media_count
      FROM posts p
      JOIN analytics_accounts aa ON aa.late_account_id = p.late_account_id
      JOIN analytics_media_items ami ON ami.account_id = aa.id AND ami.url = p.platform_post_url
      WHERE p.job_id IS NOT NULL
        AND p.platform_post_url IS NOT NULL
      GROUP BY p.job_id, p.platform
    `;
    for (const row of analytics) {
      // Per job+platform
      const jpKey = `${row.job_id}:::${row.platform}`;
      jobPlatformAnalytics[jpKey] = row;
      // Aggregate across all platforms for the job
      if (!jobAnalytics[row.job_id]) {
        jobAnalytics[row.job_id] = { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, avg_engagement: 0, media_count: 0, _engCount: 0 };
      }
      const ja = jobAnalytics[row.job_id];
      ja.total_views += Number(row.total_views);
      ja.total_likes += Number(row.total_likes);
      ja.total_comments += Number(row.total_comments);
      ja.total_shares += Number(row.total_shares);
      ja.media_count += Number(row.media_count);
      ja.avg_engagement += Number(row.avg_engagement);
      ja._engCount += 1;
    }
    // Finalize avg engagement
    for (const ja of Object.values(jobAnalytics)) {
      if (ja._engCount > 0) ja.avg_engagement = ja.avg_engagement / ja._engCount;
    }
  }

  // Step 5: Build value lookup map
  const valueMap = {};
  for (const v of allValues) {
    if (!valueMap[v.template_job_id]) valueMap[v.template_job_id] = {};
    valueMap[v.template_job_id][v.variable_id] = v.value;
  }

  // Helper: get platforms for a job (from posts, fallback to model mappings)
  const getPlatformsForJob = (job) => {
    if (platformByJob[job.id]) {
      return platformByJob[job.id].map(x => x.platform);
    }
    return platformByModel[job.model_id] || [];
  };

  // Step 6a: Apply date range filter
  let filteredJobs = allJobs;
  if (dateFrom) {
    const fromDate = new Date(dateFrom + 'T00:00:00');
    filteredJobs = filteredJobs.filter(job => new Date(job.created_at) >= fromDate);
  }
  if (dateTo) {
    const toDate = new Date(dateTo + 'T23:59:59.999');
    filteredJobs = filteredJobs.filter(job => new Date(job.created_at) <= toDate);
  }

  // Step 6b: Apply filters
  if (filters && Array.isArray(filters)) {
    for (const f of filters) {
      filteredJobs = filteredJobs.filter(job => {
        if (f.field.startsWith('var_')) {
          const varId = f.field.replace('var_', '');
          const val = valueMap[job.id]?.[varId];
          if (f.values && Array.isArray(f.values)) {
            return f.values.includes(val);
          }
          return val === f.value;
        }
        if (f.field === 'status') {
          if (f.values && Array.isArray(f.values)) return f.values.includes(job.status);
          return job.status === f.value;
        }
        if (f.field === 'platform') {
          const platforms = getPlatformsForJob(job);
          if (f.values && Array.isArray(f.values)) return platforms.some(p => f.values.includes(p));
          return platforms.includes(f.value);
        }
        if (f.field === 'model') {
          if (f.values && Array.isArray(f.values)) return f.values.includes(job.model_name);
          return job.model_name === f.value;
        }
        return true;
      });
    }
  }

  // Step 7: Group by dimensions and aggregate
  // Build a set of boolean variable IDs for default-false logic
  const booleanVarIds = new Set();
  const allVars = await sql`SELECT id, type FROM custom_variables`;
  for (const v of allVars) {
    if (v.type === 'boolean') booleanVarIds.add(v.id);
  }

  const getDimValue = (job, field) => {
    if (field.startsWith('var_')) {
      const varId = field.replace('var_', '');
      const val = valueMap[job.id]?.[varId];
      if (!val && booleanVarIds.has(varId)) return 'false';
      return val || '(empty)';
    }
    if (field === 'platform') {
      const platforms = getPlatformsForJob(job);
      return platforms[0] || null;
    }
    if (field === 'model') return job.model_name || 'No Model';
    if (field === 'status') return job.status || 'unknown';
    if (field === 'week') {
      const d = new Date(job.created_at);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().split('T')[0];
    }
    if (field === 'month') {
      const d = new Date(job.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'unknown';
  };

  // Expand jobs for platform dimension (a job posted to multiple platforms = multiple rows)
  const needsPlatformExpansion = [...(rowFields || []), ...(columnFields || [])].includes('platform');

  let expandedJobs = filteredJobs;
  if (needsPlatformExpansion) {
    expandedJobs = [];
    for (const job of filteredJobs) {
      const platforms = getPlatformsForJob(job);
      if (platforms && platforms.length > 0) {
        for (const p of platforms) {
          expandedJobs.push({ ...job, _platform: p });
        }
      }
      // Skip jobs with no platform mapping
    }
  }

  const dimGetter = (job, field) => {
    if (field === 'platform' && job._platform) return job._platform;
    return getDimValue(job, field);
  };

  const groups = {};
  for (const job of expandedJobs) {
    const dims = [...(rowFields || []), ...(columnFields || [])].map(f => dimGetter(job, f));
    if (dims.some(v => v === null)) continue; // skip jobs with no platform mapping
    const rowKey = (rowFields || []).map(f => dimGetter(job, f)).join('|||');
    const colKey = (columnFields || []).map(f => dimGetter(job, f)).join('|||');
    const key = `${rowKey}:::${colKey}`;

    if (!groups[key]) {
      groups[key] = {
        rowDims: (rowFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        colDims: (columnFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        metricValue: 0,
      };
    }

    // Per-video analytics: each job contributes its own metrics (no dedup needed)
    const metricVal = getJobMetricValue(job, metric, jobAnalytics, jobPlatformAnalytics);
    groups[key].metricValue += metricVal;
  }

  // Step 8: Build result
  const result = Object.values(groups).map(group => {
    return {
      rowDims: group.rowDims,
      colDims: group.colDims,
      metricValue: Math.round(group.metricValue * 100) / 100,
    };
  });

  return result;
}

function getJobMetricValue(job, metric, jobAnalytics, jobPlatformAnalytics) {
  if (!metric || metric === 'count') return 1;
  // Use platform-specific analytics when job is expanded for platform dimension
  let a;
  if (job._platform && jobPlatformAnalytics) {
    a = jobPlatformAnalytics[`${job.id}:::${job._platform}`];
  }
  if (!a && jobAnalytics) {
    a = jobAnalytics[job.id];
  }
  if (!a) return 0;
  if (metric === 'views') return Number(a.total_views) || 0;
  if (metric === 'likes') return Number(a.total_likes) || 0;
  if (metric === 'comments') return Number(a.total_comments) || 0;
  if (metric === 'shares') return Number(a.total_shares) || 0;
  if (metric === 'posts') return Number(a.media_count) || 0;
  if (metric === 'engagement_rate') return Number(a.avg_engagement) || 0;
  return 0;
}
