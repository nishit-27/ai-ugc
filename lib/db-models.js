import { sql } from './db-client';
import { transformModel } from './db-transforms';

export async function createModel({ name, description, groupName, avatarUrl }) {
  const result = await sql`
    INSERT INTO models (name, description, group_name, avatar_url)
    VALUES (${name}, ${description || null}, ${groupName || null}, ${avatarUrl || null})
    RETURNING *
  `;
  return transformModel(result[0]);
}

export async function getModel(id) {
  const result = await sql`SELECT * FROM models WHERE id = ${id}`;
  return result[0] ? transformModel(result[0]) : null;
}

export async function getAllModels() {
  const result = await sql`SELECT * FROM models ORDER BY created_at DESC`;
  return result.map(transformModel);
}

export async function updateModel(id, updates) {
  const { name, description, groupName, avatarUrl } = updates;
  const result = await sql`
    UPDATE models SET
      name = CASE WHEN ${name === undefined} THEN name ELSE ${name || null} END,
      description = CASE WHEN ${description === undefined} THEN description ELSE ${description || null} END,
      group_name = CASE WHEN ${groupName === undefined} THEN group_name ELSE ${groupName || null} END,
      avatar_url = CASE WHEN ${avatarUrl === undefined} THEN avatar_url ELSE ${avatarUrl || null} END
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] ? transformModel(result[0]) : null;
}

export async function deleteModel(id) {
  await sql`DELETE FROM models WHERE id = ${id}`;
}
