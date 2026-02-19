import { sql } from './db-client';
import { transformModelAccountMapping } from './db-transforms';

let schemaReady = null;

async function ensureApiKeyIndex() {
  if (schemaReady) { await schemaReady; return; }
  schemaReady = sql`ALTER TABLE model_account_mappings ADD COLUMN IF NOT EXISTS api_key_index INTEGER DEFAULT 0`;
  try { await schemaReady; } catch { schemaReady = null; }
}

export async function createModelAccountMapping({ modelId, lateAccountId, platform, apiKeyIndex = 0 }) {
  await ensureApiKeyIndex();
  const result = await sql`
    INSERT INTO model_account_mappings (model_id, late_account_id, platform, api_key_index)
    VALUES (${modelId}, ${lateAccountId}, ${platform}, ${apiKeyIndex})
    ON CONFLICT (model_id, late_account_id) DO UPDATE SET platform = EXCLUDED.platform, api_key_index = EXCLUDED.api_key_index
    RETURNING *
  `;
  return transformModelAccountMapping(result[0]);
}

export async function getModelAccountMappings(modelId) {
  await ensureApiKeyIndex();
  const result = await sql`SELECT * FROM model_account_mappings WHERE model_id = ${modelId} ORDER BY created_at ASC`;
  return result.map(transformModelAccountMapping);
}

export async function getModelAccountMappingsForModels(modelIds) {
  if (!modelIds || modelIds.length === 0) return [];
  await ensureApiKeyIndex();
  const result = await sql`SELECT * FROM model_account_mappings WHERE model_id = ANY(${modelIds}) ORDER BY created_at ASC`;
  return result.map(transformModelAccountMapping);
}

export async function deleteModelAccountMapping(id) {
  await sql`DELETE FROM model_account_mappings WHERE id = ${id}`;
}

export async function deleteModelAccountMappingsByModel(modelId) {
  await sql`DELETE FROM model_account_mappings WHERE model_id = ${modelId}`;
}

export async function replaceModelAccountMappings(modelId, accounts) {
  await ensureApiKeyIndex();
  await sql`DELETE FROM model_account_mappings WHERE model_id = ${modelId}`;
  const results = [];
  for (const { lateAccountId, platform, apiKeyIndex = 0 } of accounts) {
    const result = await sql`
      INSERT INTO model_account_mappings (model_id, late_account_id, platform, api_key_index)
      VALUES (${modelId}, ${lateAccountId}, ${platform}, ${apiKeyIndex})
      RETURNING *
    `;
    results.push(transformModelAccountMapping(result[0]));
  }
  return results;
}
