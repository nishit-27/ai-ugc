import { eq, desc, asc, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { trendingTracks } from './schema';

export async function getAllTrendingTracks() {
  return await db.select().from(trendingTracks).orderBy(desc(trendingTracks.fetchedAt), asc(trendingTracks.title));
}

export async function getTrendingTrack(id) {
  const result = await db.select().from(trendingTracks).where(eq(trendingTracks.id, id));
  return result[0] || null;
}

export async function getTrendingTracksCacheAge() {
  const result = await db.execute(sql`SELECT MAX(fetched_at) AS latest FROM trending_tracks`);
  if (!result.rows[0]?.latest) return null;
  return result.rows[0].latest;
}

export async function replaceTrendingTracks(tracks) {
  await db.delete(trendingTracks);
  if (!tracks.length) return [];

  const inserted = [];
  for (const t of tracks) {
    const result = await db.insert(trendingTracks).values({
      tiktokId: t.tiktokId,
      title: t.title,
      author: t.author || null,
      album: t.album || null,
      playUrl: t.playUrl || null,
      coverUrl: t.coverUrl || null,
      duration: t.duration || null,
      gcsUrl: t.gcsUrl || null,
    }).onConflictDoUpdate({
      target: trendingTracks.tiktokId,
      set: {
        title: sql`EXCLUDED.title`,
        author: sql`EXCLUDED.author`,
        album: sql`EXCLUDED.album`,
        playUrl: sql`EXCLUDED.play_url`,
        coverUrl: sql`EXCLUDED.cover_url`,
        duration: sql`EXCLUDED.duration`,
        gcsUrl: sql`EXCLUDED.gcs_url`,
        fetchedAt: sql`NOW()`,
      },
    }).returning();
    inserted.push(result[0]);
  }
  return inserted;
}
