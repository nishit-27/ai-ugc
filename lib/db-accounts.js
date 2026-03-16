import { eq, desc, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { tiktokAccounts } from './schema';

export async function createTikTokAccount({ accountId, username, displayName, profilePicture, accessToken, refreshToken, profileId }) {
  const result = await db.insert(tiktokAccounts).values({
    accountId,
    username: username || null,
    displayName: displayName || null,
    profilePicture: profilePicture || null,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    profileId: profileId || null,
  }).onConflictDoUpdate({
    target: tiktokAccounts.accountId,
    set: {
      username: sql`COALESCE(EXCLUDED.username, ${tiktokAccounts.username})`,
      displayName: sql`COALESCE(EXCLUDED.display_name, ${tiktokAccounts.displayName})`,
      profilePicture: sql`COALESCE(EXCLUDED.profile_picture, ${tiktokAccounts.profilePicture})`,
      accessToken: sql`COALESCE(EXCLUDED.access_token, ${tiktokAccounts.accessToken})`,
      refreshToken: sql`COALESCE(EXCLUDED.refresh_token, ${tiktokAccounts.refreshToken})`,
      profileId: sql`COALESCE(EXCLUDED.profile_id, ${tiktokAccounts.profileId})`,
      updatedAt: sql`NOW()`,
    },
  }).returning();
  return result[0];
}

export async function getTikTokAccount(id) {
  const result = await db.select().from(tiktokAccounts).where(eq(tiktokAccounts.id, id));
  return result[0] || null;
}

export async function getTikTokAccountByAccountId(accountId) {
  const result = await db.select().from(tiktokAccounts).where(eq(tiktokAccounts.accountId, accountId));
  return result[0] || null;
}

export async function getAllTikTokAccounts() {
  const result = await db.select().from(tiktokAccounts).where(eq(tiktokAccounts.isActive, true)).orderBy(desc(tiktokAccounts.createdAt));
  return result;
}

export async function deleteTikTokAccount(id) {
  await db.update(tiktokAccounts).set({ isActive: false }).where(eq(tiktokAccounts.id, id));
}
