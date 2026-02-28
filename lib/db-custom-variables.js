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

// ── Pivot query (works on real media items with real per-video metrics) ──
// Media items are linked to models via: analytics_media_items.account_id →
// analytics_accounts.late_account_id → model_account_mappings → models.
// Variable values come from the model's jobs (most-common value per variable wins).

export async function getPivotData({ rowFields, columnFields, metric, aggregation, filters, dateFrom, dateTo }) {
  const allDims = [...(rowFields || []), ...(columnFields || [])];
  const needsVariables = allDims.some(f => f.startsWith('var_')) ||
    (filters || []).some(f => f.field?.startsWith('var_'));
  const needsModel = allDims.includes('model') || (filters || []).some(f => f.field === 'model');

  // Query 1: ALL media items (with optional date filter on published_at)
  let mediaItems;
  if (dateFrom && dateTo) {
    mediaItems = await sql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at >= ${dateFrom + 'T00:00:00'}::timestamp
        AND ami.published_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else if (dateFrom) {
    mediaItems = await sql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at >= ${dateFrom + 'T00:00:00'}::timestamp
    `;
  } else if (dateTo) {
    mediaItems = await sql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else {
    mediaItems = await sql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
    `;
  }

  if (mediaItems.length === 0) return [];

  // Query 2: model_account_mappings → build late_account_id → model_id map
  const accountMappings = await sql`
    SELECT mam.model_id, mam.late_account_id, mam.platform
    FROM model_account_mappings mam
  `;
  const modelByLateAccount = {}; // late_account_id → model_id
  for (const m of accountMappings) {
    modelByLateAccount[m.late_account_id] = m.model_id;
  }

  // Attach model_id to each media item via its account's late_account_id
  for (const item of mediaItems) {
    item._model_id = modelByLateAccount[item.late_account_id] || null;
  }

  // Query 3: model names (only if model dimension needed)
  const modelNames = {}; // model_id → model_name
  if (needsModel) {
    const modelIds = [...new Set(mediaItems.map(m => m._model_id).filter(Boolean))];
    if (modelIds.length > 0) {
      const modelRows = await sql`SELECT id, name FROM models WHERE id = ANY(${modelIds})`;
      for (const r of modelRows) modelNames[r.id] = r.name;
    }
  }

  // Query 4: Variable values — aggregate from job_variable_values via model
  // For each model, find the most-common value per variable across all its jobs
  const mediaVarMap = {}; // media_item_id → { variable_id → value }
  let booleanVarIds = new Set();
  if (needsVariables) {
    // First check media_variable_values (directly linked items)
    const [directValues, allVars] = await Promise.all([
      sql`SELECT mvv.media_item_id, mvv.variable_id, mvv.value FROM media_variable_values mvv`,
      sql`SELECT id, type FROM custom_variables`,
    ]);
    for (const v of directValues) {
      if (!mediaVarMap[v.media_item_id]) mediaVarMap[v.media_item_id] = {};
      mediaVarMap[v.media_item_id][v.variable_id] = v.value;
    }
    for (const v of allVars) {
      if (v.type === 'boolean') booleanVarIds.add(v.id);
    }

    // For media items without direct variable values, use model-level aggregated values
    // Build model_id → { variable_id → most_common_value }
    const modelVarMap = {};
    const modelIds = [...new Set(mediaItems.map(m => m._model_id).filter(Boolean))];
    if (modelIds.length > 0) {
      const jobVarRows = await sql`
        SELECT tj.model_id, jvv.variable_id, jvv.value, COUNT(*)::int AS cnt
        FROM job_variable_values jvv
        JOIN template_jobs tj ON tj.id = jvv.template_job_id
        WHERE tj.model_id = ANY(${modelIds})
        GROUP BY tj.model_id, jvv.variable_id, jvv.value
        ORDER BY tj.model_id, jvv.variable_id, cnt DESC
      `;
      for (const r of jobVarRows) {
        if (!modelVarMap[r.model_id]) modelVarMap[r.model_id] = {};
        // Only keep the first (most common) value per variable
        if (!modelVarMap[r.model_id][r.variable_id]) {
          modelVarMap[r.model_id][r.variable_id] = r.value;
        }
      }
    }

    // Apply model-level vars to media items that don't have direct values
    for (const item of mediaItems) {
      if (!mediaVarMap[item.id] && item._model_id && modelVarMap[item._model_id]) {
        mediaVarMap[item.id] = { ...modelVarMap[item._model_id] };
      }
    }
  }

  // Filter: only include media items that belong to a known model (pipeline videos)
  let relevantMedia = mediaItems.filter(item => item._model_id != null);

  // Dimension value getter for media items
  const getDimValue = (item, field) => {
    if (field.startsWith('var_')) {
      const varId = field.replace('var_', '');
      const val = mediaVarMap[item.id]?.[varId];
      if (!val && booleanVarIds.has(varId)) return 'false';
      return val || '(empty)';
    }
    if (field === 'platform') return item.platform || null;
    if (field === 'model') return modelNames[item._model_id] || 'No Model';
    if (field === 'week') {
      const d = new Date(item.published_at || item.created_at);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().split('T')[0];
    }
    if (field === 'month') {
      const d = new Date(item.published_at || item.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'unknown';
  };

  // Apply filters
  let filtered = relevantMedia;
  if (filters && Array.isArray(filters)) {
    for (const f of filters) {
      filtered = filtered.filter(item => {
        if (f.field.startsWith('var_')) {
          const varId = f.field.replace('var_', '');
          const val = mediaVarMap[item.id]?.[varId];
          if (f.values && Array.isArray(f.values)) return f.values.includes(val);
          return val === f.value;
        }
        if (f.field === 'platform') {
          if (f.values && Array.isArray(f.values)) return f.values.includes(item.platform);
          return item.platform === f.value;
        }
        if (f.field === 'model') {
          const modelName = modelNames[item._model_id] || 'No Model';
          if (f.values && Array.isArray(f.values)) return f.values.includes(modelName);
          return modelName === f.value;
        }
        return true;
      });
    }
  }

  // Metric getter — real per-video metrics, no division
  const getMetricValue = (item) => {
    if (!metric || metric === 'count') return 1;
    const views = Number(item.views) || 0;
    const likes = Number(item.likes) || 0;
    const comments = Number(item.comments) || 0;
    const shares = Number(item.shares) || 0;
    if (metric === 'views') return views;
    if (metric === 'likes') return likes;
    if (metric === 'comments') return comments;
    if (metric === 'shares') return shares;
    return 0;
  };

  // Group by dimensions and aggregate
  const groups = {};
  for (const item of filtered) {
    const dims = allDims.map(f => getDimValue(item, f));
    if (dims.some(v => v === null)) continue;
    const rowKey = (rowFields || []).map(f => getDimValue(item, f)).join('|||');
    const colKey = (columnFields || []).map(f => getDimValue(item, f)).join('|||');
    const key = `${rowKey}:::${colKey}`;

    if (!groups[key]) {
      groups[key] = {
        rowDims: (rowFields || []).map(f => ({ field: f, value: getDimValue(item, f) })),
        colDims: (columnFields || []).map(f => ({ field: f, value: getDimValue(item, f) })),
        metricValue: 0,
        _views: 0,
        _interactions: 0,
      };
    }

    const g = groups[key];
    if (metric === 'engagement_rate') {
      const views = Number(item.views) || 0;
      const likes = Number(item.likes) || 0;
      const comments = Number(item.comments) || 0;
      const shares = Number(item.shares) || 0;
      g._views += views;
      g._interactions += likes + comments + shares;
    } else {
      g.metricValue += getMetricValue(item);
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
