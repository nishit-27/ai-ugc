import { sql } from './db-client';
import { transformTrendingTrack } from './db-transforms';

export async function getAllTrendingTracks() {
  const result = await sql`SELECT * FROM trending_tracks ORDER BY fetched_at DESC, title ASC`;
  return result.map(transformTrendingTrack);
}

export async function getTrendingTrack(id) {
  const result = await sql`SELECT * FROM trending_tracks WHERE id = ${id}`;
  return transformTrendingTrack(result[0]);
}

export async function getTrendingTracksCacheAge() {
  const result = await sql`SELECT MAX(fetched_at) AS latest FROM trending_tracks`;
  if (!result[0]?.latest) return null;
  return result[0].latest;
}

export async function replaceTrendingTracks(tracks) {
  await sql`DELETE FROM trending_tracks`;
  if (!tracks.length) return [];

  const inserted = [];
  for (const t of tracks) {
    const result = await sql`
      INSERT INTO trending_tracks (tiktok_id, title, author, album, play_url, cover_url, duration, gcs_url)
      VALUES (${t.tiktokId}, ${t.title}, ${t.author || null}, ${t.album || null}, ${t.playUrl || null}, ${t.coverUrl || null}, ${t.duration || null}, ${t.gcsUrl || null})
      ON CONFLICT (tiktok_id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        album = EXCLUDED.album,
        play_url = EXCLUDED.play_url,
        cover_url = EXCLUDED.cover_url,
        duration = EXCLUDED.duration,
        gcs_url = EXCLUDED.gcs_url,
        fetched_at = NOW()
      RETURNING *
    `;
    inserted.push(transformTrendingTrack(result[0]));
  }
  return inserted;
}
