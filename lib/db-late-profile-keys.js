import { eq, sql, inArray } from 'drizzle-orm';
import { db } from './drizzle';
import { lateProfileApiKeys } from './schema';

export async function saveProfileApiKey(profileId, apiKeyIndex) {
  await db.insert(lateProfileApiKeys).values({
    lateProfileId: profileId,
    apiKeyIndex,
  }).onConflictDoUpdate({
    target: lateProfileApiKeys.lateProfileId,
    set: { apiKeyIndex },
  });
}

export async function getProfileApiKey(profileId) {
  const result = await db.select({ apiKeyIndex: lateProfileApiKeys.apiKeyIndex })
    .from(lateProfileApiKeys)
    .where(eq(lateProfileApiKeys.lateProfileId, profileId));
  return result[0]?.apiKeyIndex ?? null;
}

export async function getProfileApiKeysBatch(profileIds) {
  if (!profileIds || profileIds.length === 0) return new Map();
  const result = await db.select({
    lateProfileId: lateProfileApiKeys.lateProfileId,
    apiKeyIndex: lateProfileApiKeys.apiKeyIndex,
  }).from(lateProfileApiKeys).where(inArray(lateProfileApiKeys.lateProfileId, profileIds));
  const map = new Map();
  for (const row of result) {
    map.set(row.lateProfileId, row.apiKeyIndex);
  }
  return map;
}

export async function getProfileCountPerKey() {
  const result = await db.execute(sql`
    SELECT api_key_index, COUNT(*)::int AS count FROM late_profile_api_keys
    GROUP BY api_key_index
  `);
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.api_key_index, row.count);
  }
  return map;
}

export async function deleteProfileApiKey(profileId) {
  await db.delete(lateProfileApiKeys).where(eq(lateProfileApiKeys.lateProfileId, profileId));
}
