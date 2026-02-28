import { NextResponse } from 'next/server';
import { rapidApiLimiter } from '@/lib/rateLimiter';
import { config } from '@/lib/config';
import { uploadImage } from '@/lib/storage.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type MediaItem = { url: string; type: 'image' | 'video' };
type PersistedMedia = { url: string; originalUrl: string; type: 'image' | 'video' };

/**
 * Fetch all media items from an Instagram carousel post.
 * The Instagram Looter API returns data.medias[] with all carousel slides.
 */
async function fetchInstagramCarouselMedia(postUrl: string, apiKey: string): Promise<MediaItem[]> {
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await rapidApiLimiter.acquire();

    const encodedUrl = encodeURIComponent(postUrl.trim());
    const res = await fetch(
      `https://instagram-looter2.p.rapidapi.com/post-dl?url=${encodedUrl}`,
      {
        headers: {
          'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        },
      },
    );

    if (res.status >= 429 || res.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Instagram API error: ${res.status}`);
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
      continue;
    }

    if (!res.ok) throw new Error(`Instagram API HTTP ${res.status}`);

    const json = await res.json();
    const items: MediaItem[] = [];

    // Extract all medias from the response
    const data = json?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const medias = (data as Record<string, unknown>).medias;
      if (Array.isArray(medias)) {
        for (const media of medias) {
          if (typeof media !== 'object' || !media) continue;
          const m = media as Record<string, unknown>;
          const url = (m.link || m.url) as string | undefined;
          if (!url) continue;
          // Detect type from URL or media type field
          const mediaType = (m.type as string) || '';
          const isVideo = mediaType.includes('video') || /\.mp4/i.test(url);
          items.push({ url, type: isVideo ? 'video' : 'image' });
        }
      }
    }

    if (items.length > 0) return items;

    // Fallback: try top-level fields
    if (typeof json?.video_url === 'string') {
      return [{ url: json.video_url, type: 'video' }];
    }
    if (typeof json?.url === 'string') {
      return [{ url: json.url, type: 'image' }];
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
      continue;
    }

    throw new Error('No media found in Instagram post');
  }

  throw new Error('Failed after retries');
}

/**
 * Fetch media from a TikTok photo post (carousel).
 * TikTok API returns image data in different fields depending on post type.
 */
async function fetchTikTokCarouselMedia(postUrl: string, apiKey: string): Promise<MediaItem[]> {
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await rapidApiLimiter.acquire();

    const encodedUrl = encodeURIComponent(postUrl.trim());
    const res = await fetch(
      `https://tiktok-api23.p.rapidapi.com/api/download/video?url=${encodedUrl}`,
      {
        headers: {
          'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        },
      },
    );

    if (res.status >= 429 || res.status >= 500) {
      if (attempt === maxRetries) throw new Error(`TikTok API error: ${res.status}`);
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
      continue;
    }

    if (!res.ok) throw new Error(`TikTok API HTTP ${res.status}`);

    const json = await res.json();
    const items: MediaItem[] = [];

    // TikTok photo posts have images in data.images or data.image_post_info
    const data = (json?.data || json) as Record<string, unknown>;

    // Check for photo post images
    const images = data.images as string[] | undefined;
    if (Array.isArray(images) && images.length > 0) {
      for (const url of images) {
        if (typeof url === 'string' && url) items.push({ url, type: 'image' });
      }
    }

    // Alternative: image_post_info.images[].display_image.url_list
    const imagePostInfo = data.image_post_info as Record<string, unknown> | undefined;
    if (imagePostInfo && Array.isArray(imagePostInfo.images)) {
      for (const img of imagePostInfo.images) {
        if (typeof img !== 'object' || !img) continue;
        const imgObj = img as Record<string, unknown>;
        const displayImage = imgObj.display_image as Record<string, unknown> | undefined;
        if (displayImage && Array.isArray(displayImage.url_list) && displayImage.url_list.length > 0) {
          items.push({ url: displayImage.url_list[0] as string, type: 'image' });
        }
      }
    }

    if (items.length > 0) return items;

    // Fallback: it might be a video post, return the video
    const playUrl = (data.play || data.hdplay || data.video_url) as string | undefined;
    if (playUrl) {
      return [{ url: playUrl, type: 'video' }];
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
      continue;
    }

    throw new Error('No media found in TikTok post');
  }

  throw new Error('Failed after retries');
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|reels)\//i.test(url);
}

/**
 * Download an image from an external URL and re-upload to R2.
 * Returns the permanent R2 URL. Falls back to original URL on failure.
 */
async function persistImageToR2(item: MediaItem, index: number): Promise<PersistedMedia> {
  try {
    // Instagram/TikTok CDN URLs often require proper headers to download
    const res = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,video/*,*/*',
        'Referer': item.url.includes('instagram') ? 'https://www.instagram.com/' : 'https://www.tiktok.com/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('Empty response body');
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    const filename = `carousel-import-${Date.now()}-${index}.${ext}`;
    const uploaded = await uploadImage(buf, filename);
    return { url: uploaded.url, originalUrl: item.url, type: item.type };
  } catch (err) {
    console.warn(`[FetchCarousel] Failed to persist slide ${index}:`, (err as Error).message);
    return { url: item.url, originalUrl: item.url, type: item.type };
  }
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const apiKey = config.RAPIDAPI_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RapidAPI key not configured' }, { status: 500 });
    }

    let media: MediaItem[];

    if (isInstagramUrl(url)) {
      media = await fetchInstagramCarouselMedia(url, apiKey);
    } else if (isTikTokUrl(url)) {
      media = await fetchTikTokCarouselMedia(url, apiKey);
    } else {
      return NextResponse.json(
        { error: 'Unsupported URL. Only Instagram and TikTok post URLs are supported.' },
        { status: 400 },
      );
    }

    console.log(`[FetchCarousel] Found ${media.length} media items from ${url.slice(0, 60)}`);

    // Download all images and re-upload to R2 so they're permanently accessible
    const persisted = await Promise.all(
      media.map((item, i) => persistImageToR2(item, i)),
    );

    console.log(`[FetchCarousel] Persisted ${persisted.length} items to R2`);
    return NextResponse.json({ media: persisted });
  } catch (error) {
    console.error('[FetchCarousel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch media' },
      { status: 500 },
    );
  }
}
