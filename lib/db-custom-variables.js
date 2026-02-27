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
  const allDims = [...(rowFields || []), ...(columnFields || [])];
  const needsVariables = allDims.some(f => f.startsWith('var_')) ||
    (filters || []).some(f => f.field?.startsWith('var_'));

  // Query 1: template_jobs + model name (with optional date filter pushed to SQL)
  let allJobs;
  if (dateFrom && dateTo) {
    allJobs = await sql`
      SELECT tj.id, tj.status, tj.created_at, tj.model_id, COALESCE(m.name, 'No Model') AS model_name
      FROM template_jobs tj LEFT JOIN models m ON m.id = tj.model_id
      WHERE tj.created_at >= ${dateFrom + 'T00:00:00'}::timestamp AND tj.created_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else if (dateFrom) {
    allJobs = await sql`
      SELECT tj.id, tj.status, tj.created_at, tj.model_id, COALESCE(m.name, 'No Model') AS model_name
      FROM template_jobs tj LEFT JOIN models m ON m.id = tj.model_id
      WHERE tj.created_at >= ${dateFrom + 'T00:00:00'}::timestamp
    `;
  } else if (dateTo) {
    allJobs = await sql`
      SELECT tj.id, tj.status, tj.created_at, tj.model_id, COALESCE(m.name, 'No Model') AS model_name
      FROM template_jobs tj LEFT JOIN models m ON m.id = tj.model_id
      WHERE tj.created_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else {
    allJobs = await sql`
      SELECT tj.id, tj.status, tj.created_at, tj.model_id, COALESCE(m.name, 'No Model') AS model_name
      FROM template_jobs tj LEFT JOIN models m ON m.id = tj.model_id
    `;
  }

  // Query 2: model → platform mapping
  const accountMappings = await sql`
    SELECT mam.model_id, mam.late_account_id, mam.platform
    FROM model_account_mappings mam
  `;
  const platformByModel = {};
  for (const m of accountMappings) {
    if (!platformByModel[m.model_id]) platformByModel[m.model_id] = [];
    if (!platformByModel[m.model_id].includes(m.platform)) {
      platformByModel[m.model_id].push(m.platform);
    }
  }

  // Query 3: Analytics — use analytics_accounts totals directly (same as Accounts tab)
  // Direct SQL JOIN: model_account_mappings → analytics_accounts via late_account_id
  let modelPlatformAnalytics = {}; // `${model_id}:::${platform}` → metrics
  let modelAnalytics = {};         // model_id → aggregate metrics
  if (metric && metric !== 'count') {
    const modelAccountData = await sql`
      SELECT
        mam.model_id,
        mam.platform,
        COALESCE(aa.total_views, 0)::bigint AS total_views,
        COALESCE(aa.total_likes, 0)::bigint AS total_likes,
        COALESCE(aa.total_comments, 0)::bigint AS total_comments,
        COALESCE(aa.total_shares, 0)::bigint AS total_shares,
        COALESCE(aa.engagement_rate, 0) AS engagement_rate,
        COALESCE((SELECT COUNT(*) FROM analytics_media_items ami WHERE ami.account_id = aa.id), 0)::bigint AS media_count
      FROM model_account_mappings mam
      JOIN analytics_accounts aa ON aa.late_account_id = mam.late_account_id
    `;

    for (const row of modelAccountData) {
      const key = `${row.model_id}:::${row.platform}`;
      const views = Number(row.total_views) || 0;
      const likes = Number(row.total_likes) || 0;
      const comments = Number(row.total_comments) || 0;
      const shares = Number(row.total_shares) || 0;
      const mediaCount = Number(row.media_count) || 0;
      const interactions = likes + comments + shares;

      if (!modelPlatformAnalytics[key]) {
        modelPlatformAnalytics[key] = { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_interactions: 0, media_count: 0 };
      }
      const mpa = modelPlatformAnalytics[key];
      mpa.total_views += views;
      mpa.total_likes += likes;
      mpa.total_comments += comments;
      mpa.total_shares += shares;
      mpa.total_interactions += interactions;
      mpa.media_count += mediaCount;

      if (!modelAnalytics[row.model_id]) {
        modelAnalytics[row.model_id] = { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_interactions: 0, media_count: 0 };
      }
      const ma = modelAnalytics[row.model_id];
      ma.total_views += views;
      ma.total_likes += likes;
      ma.total_comments += comments;
      ma.total_shares += shares;
      ma.total_interactions += interactions;
      ma.media_count += mediaCount;
    }
  }

  // Query 4: Variable values (only if needed)
  const valueMap = {};
  let booleanVarIds = new Set();
  if (needsVariables) {
    const [allValues, allVars] = await Promise.all([
      sql`SELECT jvv.template_job_id, jvv.variable_id, jvv.value FROM job_variable_values jvv`,
      sql`SELECT id, type FROM custom_variables`,
    ]);
    for (const v of allValues) {
      if (!valueMap[v.template_job_id]) valueMap[v.template_job_id] = {};
      valueMap[v.template_job_id][v.variable_id] = v.value;
    }
    for (const v of allVars) {
      if (v.type === 'boolean') booleanVarIds.add(v.id);
    }
  }

  // Helper: get platforms for a job
  const getPlatformsForJob = (job) => platformByModel[job.model_id] || [];

  // Apply filters
  let filteredJobs = allJobs;
  if (filters && Array.isArray(filters)) {
    for (const f of filters) {
      filteredJobs = filteredJobs.filter(job => {
        if (f.field.startsWith('var_')) {
          const varId = f.field.replace('var_', '');
          const val = valueMap[job.id]?.[varId];
          if (f.values && Array.isArray(f.values)) return f.values.includes(val);
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

  // Count jobs per model+platform for proportional per-job attribution
  // Uses filteredJobs so divisor is correct when user filters are active
  const jobCountByModelPlatform = {};
  const jobCountByModel = {};
  for (const job of filteredJobs) {
    const mid = job.model_id;
    jobCountByModel[mid] = (jobCountByModel[mid] || 0) + 1;
    const platforms = platformByModel[mid] || [];
    for (const p of platforms) {
      const key = `${mid}:::${p}`;
      jobCountByModelPlatform[key] = (jobCountByModelPlatform[key] || 0) + 1;
    }
  }

  // Dimension value getter
  const getDimValue = (job, field) => {
    if (field.startsWith('var_')) {
      const varId = field.replace('var_', '');
      const val = valueMap[job.id]?.[varId];
      if (!val && booleanVarIds.has(varId)) return 'false';
      return val || '(empty)';
    }
    if (field === 'platform') return (getPlatformsForJob(job)[0]) || null;
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

  // Expand jobs for platform dimension
  const needsPlatformExpansion = allDims.includes('platform');
  let expandedJobs = filteredJobs;
  if (needsPlatformExpansion) {
    expandedJobs = [];
    for (const job of filteredJobs) {
      const platforms = getPlatformsForJob(job);
      if (platforms.length > 0) {
        for (const p of platforms) expandedJobs.push({ ...job, _platform: p });
      }
    }
  }

  const dimGetter = (job, field) => {
    if (field === 'platform' && job._platform) return job._platform;
    return getDimValue(job, field);
  };

  // Get analytics object for a job
  // When platform is specified, use ONLY that platform's analytics (no fallback to model totals)
  const getJobAnalytics = (job) => {
    if (job._platform) {
      return modelPlatformAnalytics[`${job.model_id}:::${job._platform}`] || null;
    }
    return modelAnalytics[job.model_id] || null;
  };

  // Get job divisor for proportional distribution
  const getJobDivisor = (job) => {
    const jcKey = job._platform ? `${job.model_id}:::${job._platform}` : null;
    return (jcKey && jobCountByModelPlatform[jcKey]) || jobCountByModel[job.model_id] || 1;
  };

  // Metric getter — distributes model-level media metrics across jobs proportionally
  const getMetricValue = (job) => {
    if (!metric || metric === 'count') return 1;
    const a = getJobAnalytics(job);
    if (!a) return 0;
    const divisor = getJobDivisor(job);

    if (metric === 'views') return (a.total_views || 0) / divisor;
    if (metric === 'likes') return (a.total_likes || 0) / divisor;
    if (metric === 'comments') return (a.total_comments || 0) / divisor;
    if (metric === 'shares') return (a.total_shares || 0) / divisor;
    if (metric === 'posts') return (a.media_count || 0) / divisor;
    return 0;
  };

  // Group by dimensions and aggregate
  const groups = {};
  for (const job of expandedJobs) {
    const dims = allDims.map(f => dimGetter(job, f));
    if (dims.some(v => v === null)) continue;
    const rowKey = (rowFields || []).map(f => dimGetter(job, f)).join('|||');
    const colKey = (columnFields || []).map(f => dimGetter(job, f)).join('|||');
    const key = `${rowKey}:::${colKey}`;

    if (!groups[key]) {
      groups[key] = {
        rowDims: (rowFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        colDims: (columnFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        metricValue: 0,
        _views: 0,
        _interactions: 0,
      };
    }

    const g = groups[key];
    if (metric === 'engagement_rate') {
      // Track views and interactions separately for weighted engagement rate
      const a = getJobAnalytics(job);
      if (a) {
        const divisor = getJobDivisor(job);
        g._views += (a.total_views || 0) / divisor;
        g._interactions += (a.total_interactions || 0) / divisor;
      }
    } else {
      g.metricValue += getMetricValue(job);
    }
  }

  // Compute engagement_rate as weighted average: interactions / views * 100
  if (metric === 'engagement_rate') {
    for (const g of Object.values(groups)) {
      g.metricValue = g._views > 0 ? (g._interactions / g._views) * 100 : 0;
    }
  }

  return Object.values(groups).map(g => ({
    rowDims: g.rowDims,
    colDims: g.colDims,
    metricValue: Math.round(g.metricValue * 100) / 100,
  }));
}
