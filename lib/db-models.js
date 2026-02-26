import { sql } from './db-client';
import { transformModel } from './db-transforms';

export async function createModel({ name, description, groupName, avatarUrl }) {
  const result = await sql`
    INSERT INTO models (name, description, group_name, avatar_url)
    VALUES (${name}, ${description || null}, ${groupName || null}, ${avatarUrl || null})
    RETURNING *
  `;
  const model = result[0];

  // Also insert into junction table
  if (groupName) {
    await sql`
      INSERT INTO model_group_memberships (model_id, group_name)
      VALUES (${model.id}, ${groupName})
      ON CONFLICT (model_id, group_name) DO NOTHING
    `;
  }

  // Return with groupNames populated
  const memberships = await sql`
    SELECT group_name FROM model_group_memberships WHERE model_id = ${model.id} ORDER BY group_name
  `;
  return { ...transformModel(model), groupNames: memberships.map(r => r.group_name) };
}

export async function getModel(id) {
  const result = await sql`SELECT * FROM models WHERE id = ${id}`;
  if (!result[0]) return null;
  const memberships = await sql`
    SELECT group_name FROM model_group_memberships WHERE model_id = ${id} ORDER BY group_name
  `;
  return { ...transformModel(result[0]), groupNames: memberships.map(r => r.group_name) };
}

export async function getAllModels() {
  const [models, allMemberships] = await Promise.all([
    sql`SELECT * FROM models ORDER BY created_at DESC`,
    sql`SELECT model_id, group_name FROM model_group_memberships ORDER BY group_name`,
  ]);

  const membershipMap = new Map();
  for (const row of allMemberships) {
    const existing = membershipMap.get(row.model_id) || [];
    existing.push(row.group_name);
    membershipMap.set(row.model_id, existing);
  }

  return models.map(row => ({
    ...transformModel(row),
    groupNames: membershipMap.get(row.id) || [],
  }));
}

export async function updateModel(id, updates) {
  const { name, description, avatarUrl } = updates;
  const result = await sql`
    UPDATE models SET
      name = CASE WHEN ${name === undefined} THEN name ELSE ${name || null} END,
      description = CASE WHEN ${description === undefined} THEN description ELSE ${description || null} END,
      avatar_url = CASE WHEN ${avatarUrl === undefined} THEN avatar_url ELSE ${avatarUrl || null} END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!result[0]) return null;
  const memberships = await sql`
    SELECT group_name FROM model_group_memberships WHERE model_id = ${id} ORDER BY group_name
  `;
  return { ...transformModel(result[0]), groupNames: memberships.map(r => r.group_name) };
}

export async function deleteModel(id) {
  await sql`DELETE FROM models WHERE id = ${id}`;
}

// ── Multi-group membership functions ──

export async function getModelGroups(modelId) {
  const result = await sql`
    SELECT group_name FROM model_group_memberships WHERE model_id = ${modelId} ORDER BY group_name
  `;
  return result.map(r => r.group_name);
}

export async function getAllModelGroupMemberships() {
  const result = await sql`SELECT model_id, group_name FROM model_group_memberships ORDER BY group_name`;
  return result;
}

export async function setModelGroups(modelId, groupNames) {
  // Replace all memberships for a model
  await sql`DELETE FROM model_group_memberships WHERE model_id = ${modelId}`;
  if (groupNames && groupNames.length > 0) {
    for (const groupName of groupNames) {
      const trimmed = groupName.trim();
      if (!trimmed) continue;
      await sql`
        INSERT INTO model_group_memberships (model_id, group_name)
        VALUES (${modelId}, ${trimmed})
        ON CONFLICT (model_id, group_name) DO NOTHING
      `;
    }
  }
  // Also sync legacy column (first group or null)
  const firstGroup = groupNames && groupNames.length > 0 ? groupNames[0].trim() : null;
  await sql`UPDATE models SET group_name = ${firstGroup} WHERE id = ${modelId}`;
}

export async function addModelToGroup(modelId, groupName) {
  await sql`
    INSERT INTO model_group_memberships (model_id, group_name)
    VALUES (${modelId}, ${groupName})
    ON CONFLICT (model_id, group_name) DO NOTHING
  `;
}

export async function removeModelFromGroup(modelId, groupName) {
  await sql`
    DELETE FROM model_group_memberships
    WHERE model_id = ${modelId} AND group_name = ${groupName}
  `;
}

export async function removeAllMembershipsForGroup(groupName) {
  await sql`
    DELETE FROM model_group_memberships
    WHERE lower(group_name) = lower(${groupName})
  `;
}

export async function renameGroupMemberships(oldName, newName) {
  await sql`
    UPDATE model_group_memberships
    SET group_name = ${newName}
    WHERE lower(group_name) = lower(${oldName})
  `;
}
