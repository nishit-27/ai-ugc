import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { sql } from './db-client';
import { lateApiKeyLimits } from './schema';

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS late_api_key_limits (
      api_key_index INTEGER PRIMARY KEY,
      learned_limit INTEGER NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  tableEnsured = true;
}

export async function getLearnedLimitsAll() {
  await ensureTable();
  const rows = await db.select().from(lateApiKeyLimits);
  const map = new Map();
  for (const row of rows) map.set(row.apiKeyIndex, row.learnedLimit);
  return map;
}

export async function getLearnedLimit(apiKeyIndex) {
  await ensureTable();
  const rows = await db
    .select({ learnedLimit: lateApiKeyLimits.learnedLimit })
    .from(lateApiKeyLimits)
    .where(eq(lateApiKeyLimits.apiKeyIndex, apiKeyIndex));
  return rows[0]?.learnedLimit ?? null;
}

export async function setLearnedLimit(apiKeyIndex, learnedLimit) {
  await ensureTable();
  await db
    .insert(lateApiKeyLimits)
    .values({ apiKeyIndex, learnedLimit, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: lateApiKeyLimits.apiKeyIndex,
      set: { learnedLimit, updatedAt: new Date() },
    });
}
