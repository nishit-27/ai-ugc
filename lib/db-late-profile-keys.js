import { sql } from './db-client';

let schemaInitPromise = null;

async function ensureSchema() {
  if (schemaInitPromise) {
    await schemaInitPromise;
    return;
  }

  schemaInitPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS late_profile_api_keys (
        late_profile_id TEXT PRIMARY KEY,
        api_key_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  })();

  try {
    await schemaInitPromise;
  } catch (error) {
    schemaInitPromise = null;
    throw error;
  }
}

export async function saveProfileApiKey(profileId, apiKeyIndex) {
  await ensureSchema();
  await sql`
    INSERT INTO late_profile_api_keys (late_profile_id, api_key_index)
    VALUES (${profileId}, ${apiKeyIndex})
    ON CONFLICT (late_profile_id) DO UPDATE SET api_key_index = EXCLUDED.api_key_index
  `;
}

export async function getProfileApiKey(profileId) {
  await ensureSchema();
  const result = await sql`
    SELECT api_key_index FROM late_profile_api_keys WHERE late_profile_id = ${profileId}
  `;
  return result[0]?.api_key_index ?? null;
}

export async function getProfileApiKeysBatch(profileIds) {
  if (!profileIds || profileIds.length === 0) return new Map();
  await ensureSchema();
  const result = await sql`
    SELECT late_profile_id, api_key_index FROM late_profile_api_keys
    WHERE late_profile_id = ANY(${profileIds})
  `;
  const map = new Map();
  for (const row of result) {
    map.set(row.late_profile_id, row.api_key_index);
  }
  return map;
}

export async function getProfileCountPerKey() {
  await ensureSchema();
  const result = await sql`
    SELECT api_key_index, COUNT(*)::int AS count FROM late_profile_api_keys
    GROUP BY api_key_index
  `;
  const map = new Map();
  for (const row of result) {
    map.set(row.api_key_index, row.count);
  }
  return map;
}

export async function deleteProfileApiKey(profileId) {
  await ensureSchema();
  await sql`DELETE FROM late_profile_api_keys WHERE late_profile_id = ${profileId}`;
}
