import { db } from './drizzle';
import { modelAccountMappings } from './schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { sql as rawSql } from './db-client';

export async function createModelAccountMapping({ modelId, lateAccountId, platform, apiKeyIndex = 0 }) {
  const [row] = await db.insert(modelAccountMappings).values({
    modelId,
    lateAccountId,
    platform,
    apiKeyIndex,
  }).onConflictDoUpdate({
    target: [modelAccountMappings.modelId, modelAccountMappings.lateAccountId],
    set: { platform, apiKeyIndex },
  }).returning();
  return row;
}

export async function getModelAccountMappings(modelId) {
  return db.select().from(modelAccountMappings)
    .where(eq(modelAccountMappings.modelId, modelId))
    .orderBy(asc(modelAccountMappings.createdAt));
}

export async function getModelAccountMappingsForModels(modelIds) {
  if (!modelIds || modelIds.length === 0) return [];
  return db.select().from(modelAccountMappings)
    .where(inArray(modelAccountMappings.modelId, modelIds))
    .orderBy(asc(modelAccountMappings.createdAt));
}

export async function deleteModelAccountMapping(id) {
  await db.delete(modelAccountMappings).where(eq(modelAccountMappings.id, id));
}

export async function deleteModelAccountMappingsByModel(modelId) {
  await db.delete(modelAccountMappings).where(eq(modelAccountMappings.modelId, modelId));
}

export async function replaceModelAccountMappings(modelId, accounts) {
  await db.delete(modelAccountMappings).where(eq(modelAccountMappings.modelId, modelId));
  const results = [];
  for (const { lateAccountId, platform, apiKeyIndex = 0 } of accounts) {
    const [row] = await db.insert(modelAccountMappings).values({
      modelId,
      lateAccountId,
      platform,
      apiKeyIndex,
    }).returning();
    results.push(row);
  }
  return results;
}

export async function getAccountToModelMap() {
  const rows = await rawSql`
    SELECT mam.late_account_id, mam.model_id, m.name as model_name
    FROM model_account_mappings mam
    JOIN models m ON m.id = mam.model_id
  `;
  const map = {};
  for (const row of rows) {
    map[row.late_account_id] = {
      modelId: row.model_id,
      modelName: row.model_name,
    };
  }
  return map;
}

export async function getAllModelAccountMappingsWithModelNames() {
  return rawSql`
    SELECT
      mam.model_id,
      mam.late_account_id,
      mam.platform,
      mam.api_key_index,
      m.name as model_name
    FROM model_account_mappings mam
    JOIN models m ON m.id = mam.model_id
    ORDER BY m.name ASC
  `;
}
