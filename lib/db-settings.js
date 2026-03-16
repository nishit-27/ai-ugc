import { eq, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { appSettings } from './schema';

export async function getSetting(key) {
  const result = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return result[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await db.insert(appSettings).values({ key, value, updatedAt: sql`NOW()` }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value, updatedAt: sql`NOW()` },
  });
}
