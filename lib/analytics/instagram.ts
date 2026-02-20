const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST_INSTAGRAM || 'instagram-looter2.p.rapidapi.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rapidApiGet(path: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Instagram API error ${res.status}: ${text}`);
      }
      return await res.json() as Record<string, unknown>;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export type InstagramProfile = {
  userId: string;
  username: string;
  displayName: string;
  profileUrl: string;
  followers: number;
  following: number;
  mediaCount: number;
};

/**
 * Single /profile call replaces both resolveInstagramUser() and fetchInstagramProfile().
 * Returns user ID + profile stats + in one API call.
 */
export async function fetchInstagramProfileByUsername(username: string): Promise<InstagramProfile> {
  const data = await rapidApiGet(`/profile?username=${encodeURIComponent(username)}`);

  if (data?.status === false || !data?.id) {
    throw new Error(`Could not resolve Instagram user: ${username}`);
  }

  return {
    userId: String(data.id),
    username: data.username || username,
    displayName: data.full_name || data.username || username,
    profileUrl: data.profile_pic_url_hd || data.profile_pic_url || '',
    followers: Number(data.edge_followed_by?.count ?? data.follower_count ?? 0),
    following: Number(data.edge_follow?.count ?? data.following_count ?? 0),
    mediaCount: Number(data.edge_owner_to_timeline_media?.count ?? data.media_count ?? 0),
  };
}

export type InstagramReel = {
  externalId: string;
  caption: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

/**
 * Fetch ALL reels — keeps paginating until the API says there are no more.
 * No arbitrary page limit. Uses duplicate cursor detection to prevent infinite loops.
 */
export async function fetchInstagramReels(userId: string): Promise<InstagramReel[]> {
  const reels: InstagramReel[] = [];
  let nextMaxId: string | undefined;
  const seenCursors = new Set<string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const path = nextMaxId
      ? `/reels?id=${userId}&count=12&max_id=${nextMaxId}`
      : `/reels?id=${userId}&count=12`;

    const data = await rapidApiGet(path);
    const items = data?.items || data?.data?.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const media = item?.media || item;
      const externalId = String(media?.pk || media?.id || media?.code || '');
      reels.push({
        externalId,
        caption: media?.caption?.text || '',
        url: media?.code ? `https://www.instagram.com/reel/${media.code}/` : '',
        thumbnailUrl: media?.image_versions2?.candidates?.[0]?.url || media?.thumbnail_url || '',
        publishedAt: media?.taken_at ? new Date(Number(media.taken_at) * 1000).toISOString() : '',
        views: Number(media?.play_count ?? media?.video_play_count ?? media?.ig_play_count ?? media?.view_count ?? 0),
        likes: Number(media?.like_count ?? 0),
        comments: Number(media?.comment_count ?? 0),
        shares: Number(media?.share_count ?? media?.reshare_count ?? media?.send_count ?? media?.shares ?? 0),
        saves: Number(media?.save_count ?? media?.saved_count ?? media?.saves ?? 0),
      });
    }

    nextMaxId = data?.paging_info?.max_id || data?.next_max_id;
    if (!nextMaxId || !data?.paging_info?.more_available) break;

    // Prevent infinite loop if API keeps returning the same cursor
    if (seenCursors.has(nextMaxId)) {
      console.warn(`[analytics] Instagram reels: duplicate cursor detected (${nextMaxId}), stopping pagination`);
      break;
    }
    seenCursors.add(nextMaxId);
  }

  return reels;
}
