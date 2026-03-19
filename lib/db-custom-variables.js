import { sql as rawSql } from './db-client';
import { db } from './drizzle';
import { customVariables, jobVariableValues, mediaVariableValues } from './schema';
import { eq, asc } from 'drizzle-orm';

// ── Custom Variables CRUD ──

export async function createCustomVariable({ name, type, options, color }) {
  const result = await db.insert(customVariables).values({
    name,
    type,
    options: options || null,
    color: color || null,
  }).returning();
  return result[0] || null;
}

export async function getAllCustomVariables() {
  return db.select().from(customVariables).orderBy(asc(customVariables.createdAt));
}

export async function getCustomVariable(id) {
  const rows = await db.select().from(customVariables).where(eq(customVariables.id, id));
  return rows[0] || null;
}

export async function updateCustomVariable(id, { name, type, options, color }) {
  const rows = await rawSql`
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
  await db.delete(customVariables).where(eq(customVariables.id, id));
}

// ── Job Variable Values ──

export async function getJobVariableValues(templateJobId) {
  return rawSql`
    SELECT jvv.*, cv.name AS variable_name, cv.type AS variable_type
    FROM job_variable_values jvv
    JOIN custom_variables cv ON cv.id = jvv.variable_id
    WHERE jvv.template_job_id = ${templateJobId}
  `;
}

export async function getJobVariableValuesByTemplateJobIds(templateJobIds) {
  const ids = [...new Set((templateJobIds || []).filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))];
  if (ids.length === 0) return {};

  const rows = await rawSql`
    SELECT jvv.template_job_id, cv.name AS variable_name, jvv.value
    FROM job_variable_values jvv
    JOIN custom_variables cv ON cv.id = jvv.variable_id
    WHERE jvv.template_job_id = ANY(${ids}::uuid[])
  `;

  const valueMap = {};
  for (const row of rows) {
    if (!valueMap[row.template_job_id]) valueMap[row.template_job_id] = {};
    valueMap[row.template_job_id][row.variable_name] = row.value;
  }

  return valueMap;
}

export async function setJobVariableValues(templateJobId, values) {
  const results = [];
  for (const { variableId, value } of values) {
    const rows = await db.insert(jobVariableValues).values({
      templateJobId,
      variableId,
      value,
    }).onConflictDoUpdate({
      target: [jobVariableValues.templateJobId, jobVariableValues.variableId],
      set: { value },
    }).returning();
    if (rows[0]) results.push(rows[0]);
  }
  return results;
}

export async function deleteJobVariableValues(templateJobId) {
  await db.delete(jobVariableValues).where(eq(jobVariableValues.templateJobId, templateJobId));
}

// ── Media Variable Values ──

export async function copyJobVariablesToMediaVariables(mediaItemId, jobId) {
  const inserted = await rawSql`
    INSERT INTO media_variable_values (media_item_id, variable_id, value)
    SELECT ${mediaItemId}, variable_id, value
    FROM job_variable_values WHERE template_job_id = ${jobId}
    ON CONFLICT (media_item_id, variable_id) DO NOTHING
  `;
  return inserted.length || 0;
}

export async function deleteMediaVariableValues(mediaItemId) {
  await db.delete(mediaVariableValues).where(eq(mediaVariableValues.mediaItemId, mediaItemId));
}

export async function syncJobVariablesToMedia(jobId, linkedMediaItems) {
  for (const media of linkedMediaItems) {
    await db.delete(mediaVariableValues).where(eq(mediaVariableValues.mediaItemId, media.id));
    await rawSql`
      INSERT INTO media_variable_values (media_item_id, variable_id, value)
      SELECT ${media.id}, variable_id, value
      FROM job_variable_values WHERE template_job_id = ${jobId}
      ON CONFLICT (media_item_id, variable_id) DO NOTHING
    `;
  }
}

export async function getMediaVariableValuesByExternalIds(externalIds) {
  const ids = [...new Set((externalIds || []).filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))];
  if (ids.length === 0) return {};

  const rows = await rawSql`
    WITH direct_values AS (
      SELECT ami.external_id, cv.name AS variable_name, mvv.value, 0 AS priority
      FROM analytics_media_items ami
      JOIN media_variable_values mvv ON mvv.media_item_id = ami.id
      JOIN custom_variables cv ON cv.id = mvv.variable_id
      WHERE ami.external_id = ANY(${ids})
    ),
    job_values AS (
      SELECT ami.external_id, cv.name AS variable_name, jvv.value, 1 AS priority
      FROM analytics_media_items ami
      JOIN job_variable_values jvv ON jvv.template_job_id = ami.template_job_id
      JOIN custom_variables cv ON cv.id = jvv.variable_id
      WHERE ami.external_id = ANY(${ids})
    ),
    ranked_values AS (
      SELECT DISTINCT ON (external_id, variable_name)
        external_id,
        variable_name,
        value
      FROM (
        SELECT * FROM direct_values
        UNION ALL
        SELECT * FROM job_values
      ) values_by_source
      ORDER BY external_id, variable_name, priority
    )
    SELECT external_id, variable_name, value
    FROM ranked_values
  `;

  const variableMap = {};
  for (const row of rows) {
    if (!variableMap[row.external_id]) variableMap[row.external_id] = {};
    variableMap[row.external_id][row.variable_name] = row.value;
  }

  return variableMap;
}

export async function getPostVariableValuesByExternalIds(externalIds) {
  const ids = [...new Set((externalIds || []).filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))];
  if (ids.length === 0) return {};

  const rows = await rawSql`
    WITH matched_posts AS (
      SELECT p.job_id, p.external_post_id, p.late_post_id
      FROM posts p
      WHERE (p.external_post_id IS NOT NULL AND p.external_post_id = ANY(${ids}))
         OR (p.late_post_id IS NOT NULL AND p.late_post_id = ANY(${ids}))
    ),
    post_keys AS (
      SELECT job_id, external_post_id AS external_id
      FROM matched_posts
      WHERE job_id IS NOT NULL AND external_post_id IS NOT NULL
      UNION ALL
      SELECT job_id, late_post_id AS external_id
      FROM matched_posts
      WHERE job_id IS NOT NULL AND late_post_id IS NOT NULL
    )
    SELECT pk.external_id, cv.name AS variable_name, jvv.value
    FROM post_keys pk
    JOIN job_variable_values jvv ON jvv.template_job_id = pk.job_id
    JOIN custom_variables cv ON cv.id = jvv.variable_id
  `;

  const variableMap = {};
  for (const row of rows) {
    if (!variableMap[row.external_id]) variableMap[row.external_id] = {};
    variableMap[row.external_id][row.variable_name] = row.value;
  }

  return variableMap;
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
    mediaItems = await rawSql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at >= ${dateFrom + 'T00:00:00'}::timestamp
        AND ami.published_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else if (dateFrom) {
    mediaItems = await rawSql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at >= ${dateFrom + 'T00:00:00'}::timestamp
    `;
  } else if (dateTo) {
    mediaItems = await rawSql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
      WHERE ami.published_at <= ${dateTo + 'T23:59:59.999'}::timestamp
    `;
  } else {
    mediaItems = await rawSql`
      SELECT ami.id, ami.platform, ami.published_at, ami.views, ami.likes, ami.comments, ami.shares, ami.saves, ami.engagement_rate, ami.template_job_id, ami.account_id,
             aa.username AS account_name, aa.late_account_id
      FROM analytics_media_items ami
      JOIN analytics_accounts aa ON aa.id = ami.account_id
    `;
  }

  if (mediaItems.length === 0) return [];

  // Query 2: model_account_mappings → build late_account_id → model_id map
  const accountMappings = await rawSql`
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
      const modelRows = await rawSql`SELECT id, name FROM models WHERE id = ANY(${modelIds})`;
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
      rawSql`SELECT mvv.media_item_id, mvv.variable_id, mvv.value FROM media_variable_values mvv`,
      rawSql`SELECT id, type FROM custom_variables`,
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
      const jobVarRows = await rawSql`
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
