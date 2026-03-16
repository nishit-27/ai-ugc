import { eq, desc } from 'drizzle-orm';
import { db } from './drizzle';
import { musicTracks } from './schema';

export async function createMusicTrack({ name, gcsUrl, duration, isDefault }) {
  const result = await db.insert(musicTracks).values({
    name,
    gcsUrl,
    duration: duration || null,
    isDefault: isDefault || false,
  }).returning();
  return result[0];
}

export async function getAllMusicTracks() {
  return await db.select().from(musicTracks).orderBy(desc(musicTracks.isDefault), desc(musicTracks.createdAt));
}

export async function deleteMusicTrack(id) {
  await db.delete(musicTracks).where(eq(musicTracks.id, id));
}
