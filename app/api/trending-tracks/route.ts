import { NextResponse } from 'next/server';
import { initDatabase, getAllTrendingTracks, getTrendingTracksCacheAge, replaceTrendingTracks } from '@/lib/db';
import { config } from '@/lib/config';
import { uploadBuffer } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESOLVE_CONCURRENCY = 3;
const MAX_TRACKS = 20; // Limit to top 20 to avoid route timeout

// GET — serve tracks from DB only, include stale flag
export async function GET() {
  try {
    await initDatabase();
    const tracks = await getAllTrendingTracks();
    const latestFetchedAt = await getTrendingTracksCacheAge();
    const stale = !latestFetchedAt || (Date.now() - new Date(latestFetchedAt).getTime()) > CACHE_MAX_AGE_MS;

    return NextResponse.json({ tracks, stale });
  } catch (err) {
    console.error('Trending tracks GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch trending tracks' }, { status: 500 });
  }
}

// POST — full refresh: fetch trending list → resolve audio via musicPosts → download to GCS → replace DB
export async function POST() {
  try {
    await initDatabase();

    if (!config.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'RAPIDAPI_KEY is not configured' }, { status: 500 });
    }

    // 1. Fetch trending metadata
    const res = await fetch('https://tiktok-trending1.p.rapidapi.com/api/music?country=US', {
      headers: {
        'x-rapidapi-key': config.RAPIDAPI_KEY,
        'x-rapidapi-host': 'tiktok-trending1.p.rapidapi.com',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[TrendingRefresh] API error:', res.status, body.slice(0, 500));
      return NextResponse.json({ error: `Trending API returned ${res.status}` }, { status: 502 });
    }

    const raw = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw?.data || raw?.body || [];

    if (items.length === 0) {
      return NextResponse.json({ error: 'API returned no tracks' }, { status: 502 });
    }

    // 2. Parse metadata — extract the real TikTok music ID from the link URL
    const parsed = items.map((t) => {
      const link = String(t.link || '');
      // link format: https://www.tiktok.com/music/x-6766099490878261249
      // The number after the last '-' is the real TikTok music ID
      const linkMatch = link.match(/-(\d+)$/);
      const tiktokMusicId = linkMatch ? linkMatch[1] : String(t.music_id || '');

      return {
        tiktokId: tiktokMusicId,
        title: String(t.music_name || 'Unknown'),
        author: String(t.author || '') || null,
        album: null as string | null,
        playUrl: null as string | null,
        coverUrl: String(t.cover || '') || null,
        duration: Number(t.duration || 0) || null,
        gcsUrl: undefined as string | undefined,
      };
    }).filter((t) => t.tiktokId);

    // Deduplicate and limit to top N
    const seen = new Set<string>();
    const unique = parsed.filter((t) => {
      if (seen.has(t.tiktokId)) return false;
      seen.add(t.tiktokId);
      return true;
    }).slice(0, MAX_TRACKS);

    console.log(`[TrendingRefresh] Processing top ${unique.length} tracks. Resolving audio URLs...`);

    // 3. Resolve audio URLs and download to GCS
    const withAudio = await resolveAndDownload(unique, config.RAPIDAPI_KEY);
    const successCount = withAudio.filter((t) => t.gcsUrl).length;
    console.log(`[TrendingRefresh] Downloaded ${successCount}/${withAudio.length} tracks to GCS`);

    // 4. Replace DB (only store tracks that have audio)
    const tracksWithAudio = withAudio.filter((t) => t.gcsUrl);
    const tracks = await replaceTrendingTracks(tracksWithAudio);

    return NextResponse.json({ tracks, stale: false });
  } catch (err) {
    console.error('Trending tracks refresh error:', err);
    return NextResponse.json({ error: 'Failed to refresh trending tracks' }, { status: 500 });
  }
}

type ParsedTrack = {
  tiktokId: string;
  title: string;
  author: string | null;
  album: string | null;
  playUrl: string | null;
  coverUrl: string | null;
  duration: number | null;
  gcsUrl?: string;
};

async function resolveAndDownload(tracks: ParsedTrack[], apiKey: string): Promise<ParsedTrack[]> {
  const results = [...tracks];

  for (let i = 0; i < results.length; i += RESOLVE_CONCURRENCY) {
    const batch = results.slice(i, i + RESOLVE_CONCURRENCY);
    const promises = batch.map(async (track, batchIdx) => {
      const idx = i + batchIdx;
      try {
        // Step A: Get audio URL via musicPosts endpoint
        const audioUrl = await resolveAudioUrl(track.tiktokId, apiKey);
        if (!audioUrl) {
          console.warn(`[TrendingRefresh] No audio URL for "${track.title}" (${track.tiktokId})`);
          return;
        }

        results[idx] = { ...results[idx], playUrl: audioUrl };

        // Step B: Download audio to GCS
        const audioRes = await fetch(audioUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!audioRes.ok) {
          console.warn(`[TrendingRefresh] Audio download failed for "${track.title}": ${audioRes.status}`);
          return;
        }

        const buffer = Buffer.from(await audioRes.arrayBuffer());
        if (buffer.length < 1000) {
          console.warn(`[TrendingRefresh] Audio too small for "${track.title}" (${buffer.length}b), skipping`);
          return;
        }

        const filename = `trending-music/${uuidv4()}.mp3`;
        const gcsUrl = await uploadBuffer(buffer, filename, {
          folder: 'ai-ugc',
          contentType: 'audio/mpeg',
          bucketType: 'DRIVE',
        });

        results[idx] = { ...results[idx], gcsUrl };
      } catch (err) {
        console.warn(`[TrendingRefresh] Error for "${track.title}":`, err);
      }
    });

    await Promise.all(promises);

    // Rate limit delay between batches
    if (i + RESOLVE_CONCURRENCY < results.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return results;
}

// Resolve audio play URL by fetching one video post that uses this music
async function resolveAudioUrl(tiktokMusicId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://tiktok-api23.p.rapidapi.com/api/music/posts?musicId=${tiktokMusicId}&count=1`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
        },
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const items = data.itemList as Record<string, unknown>[] | undefined;
    if (!items?.length) return null;

    const music = items[0].music as Record<string, unknown> | undefined;
    if (!music) return null;

    // Extract playUrl from the music object
    if (typeof music.playUrl === 'string' && music.playUrl) return music.playUrl;
    if (typeof music.play_url === 'string' && music.play_url) return music.play_url;
    if (typeof music.play === 'string' && music.play) return music.play;

    return null;
  } catch (err) {
    console.warn(`[TrendingRefresh] resolveAudioUrl failed for ${tiktokMusicId}:`, err);
    return null;
  }
}
