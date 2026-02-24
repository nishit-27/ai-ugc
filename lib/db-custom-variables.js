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

  // Step 2: Get platform per model from model_account_mappings
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

  // Step 4: Get analytics per model via model_account_mappings → analytics_accounts → analytics_media_items
  // Also build a per-model+platform map for platform-expanded jobs
  let modelAnalytics = {}; // model_id → { total_views, total_likes, ... }
  let modelPlatformAnalytics = {}; // `${model_id}:::${platform}` → { ... }
  if (metric && metric !== 'count') {
    const analytics = await sql`
      SELECT
        mam.model_id,
        mam.platform,
        COALESCE(SUM(ami.views), 0) AS total_views,
        COALESCE(SUM(ami.likes), 0) AS total_likes,
        COALESCE(SUM(ami.comments), 0) AS total_comments,
        COALESCE(SUM(ami.shares), 0) AS total_shares,
        COALESCE(AVG(ami.engagement_rate), 0) AS avg_engagement,
        COUNT(ami.id) AS media_count
      FROM model_account_mappings mam
      JOIN analytics_accounts aa ON aa.late_account_id = mam.late_account_id
      JOIN analytics_media_items ami ON ami.account_id = aa.id
      GROUP BY mam.model_id, mam.platform
    `;
    for (const row of analytics) {
      // Per model+platform
      const mpKey = `${row.model_id}:::${row.platform}`;
      modelPlatformAnalytics[mpKey] = row;
      // Aggregate across all platforms for the model
      if (!modelAnalytics[row.model_id]) {
        modelAnalytics[row.model_id] = { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, avg_engagement: 0, media_count: 0, _engCount: 0 };
      }
      const ma = modelAnalytics[row.model_id];
      ma.total_views += Number(row.total_views);
      ma.total_likes += Number(row.total_likes);
      ma.total_comments += Number(row.total_comments);
      ma.total_shares += Number(row.total_shares);
      ma.media_count += Number(row.media_count);
      ma.avg_engagement += Number(row.avg_engagement);
      ma._engCount += 1;
    }
    // Finalize avg engagement
    for (const ma of Object.values(modelAnalytics)) {
      if (ma._engCount > 0) ma.avg_engagement = ma.avg_engagement / ma._engCount;
    }
  }

  // Step 5: Build value lookup map
  const valueMap = {};
  for (const v of allValues) {
    if (!valueMap[v.template_job_id]) valueMap[v.template_job_id] = {};
    valueMap[v.template_job_id][v.variable_id] = v.value;
  }

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
          const platforms = platformByModel[job.model_id] || [];
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
      const platforms = platformByModel[job.model_id] || [];
      return platforms[0] || 'unknown';
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

  // Expand jobs for platform dimension (a model with multiple platforms = multiple rows)
  const needsPlatformExpansion = [...(rowFields || []), ...(columnFields || [])].includes('platform');

  let expandedJobs = filteredJobs;
  if (needsPlatformExpansion) {
    expandedJobs = [];
    for (const job of filteredJobs) {
      const platforms = platformByModel[job.model_id];
      if (platforms && platforms.length > 0) {
        for (const p of platforms) {
          expandedJobs.push({ ...job, _platform: p });
        }
      } else {
        expandedJobs.push({ ...job, _platform: 'unknown' });
      }
    }
  }

  const dimGetter = (job, field) => {
    if (field === 'platform' && job._platform) return job._platform;
    return getDimValue(job, field);
  };

  const groups = {};
  for (const job of expandedJobs) {
    const rowKey = (rowFields || []).map(f => dimGetter(job, f)).join('|||');
    const colKey = (columnFields || []).map(f => dimGetter(job, f)).join('|||');
    const key = `${rowKey}:::${colKey}`;

    if (!groups[key]) {
      groups[key] = {
        rowDims: (rowFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        colDims: (columnFields || []).map(f => ({ field: f, value: dimGetter(job, f) })),
        seenModels: new Set(), // track which models already counted in this group
        metricValue: 0,
      };
    }

    // Analytics are per-model — only count each model once per group
    // For platform-expanded jobs, key is model_id + platform
    const modelKey = job._platform ? `${job.model_id}:::${job._platform}` : job.model_id;
    if (!groups[key].seenModels.has(modelKey)) {
      groups[key].seenModels.add(modelKey);
      const metricVal = getMetricValue(job, metric, modelAnalytics, modelPlatformAnalytics);
      groups[key].metricValue += metricVal;
    }
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

function getMetricValue(job, metric, modelAnalytics, modelPlatformAnalytics) {
  if (!metric || metric === 'count') return 1;
  // Use platform-specific analytics when job is expanded for platform dimension
  let a;
  if (job._platform && modelPlatformAnalytics) {
    a = modelPlatformAnalytics[`${job.model_id}:::${job._platform}`];
  }
  if (!a && modelAnalytics) {
    a = modelAnalytics[job.model_id];
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
