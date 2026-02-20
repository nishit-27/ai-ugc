const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST_TIKTOK || 'tiktok-api23.p.rapidapi.com';

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
        throw new Error(`TikTok API error ${res.status}: ${text}`);
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

type TikTokUserInfo = {
  secUid: string;
  username: string;
  displayName: string;
  profileUrl: string;
  followers: number;
  following: number;
  likes: number;
  videoCount: number;
};

export async function resolveTikTokUser(username: string): Promise<TikTokUserInfo> {
  const data = await rapidApiGet(`/api/user/info?uniqueId=${encodeURIComponent(username)}`);
  const userInfo = data?.userInfo || data;
  const user = userInfo?.user || {};
  const stats = userInfo?.stats || {};

  const secUid = user?.secUid;
  if (!secUid) throw new Error(`Could not resolve TikTok user: ${username}`);

  return {
    secUid,
    username: user?.uniqueId || username,
    displayName: user?.nickname || username,
    profileUrl: user?.avatarLarger || user?.avatarMedium || user?.avatarThumb || '',
    followers: Number(stats?.followerCount ?? 0),
    following: Number(stats?.followingCount ?? 0),
    likes: Number(stats?.heartCount ?? stats?.heart ?? 0),
    videoCount: Number(stats?.videoCount ?? 0),
  };
}

type TikTokPost = {
  externalId: string;
  caption: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

/**
 * Fetch ALL posts — keeps paginating until hasMore=false.
 * No arbitrary page limit. Uses duplicate cursor detection to prevent infinite loops.
 */
export async function fetchTikTokPosts(secUid: string): Promise<TikTokPost[]> {
  const posts: TikTokPost[] = [];
  let cursor = '0';
  const seenCursors = new Set<string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const path = `/api/user/posts?secUid=${encodeURIComponent(secUid)}&count=35&cursor=${cursor}`;
    const raw = await rapidApiGet(path);
    // API wraps response in a `data` envelope
    const data = raw?.data ?? raw;
    const items = data?.itemList || data?.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const statsV2 = item?.statsV2 || {};
      const stats = item?.stats || {};
      const externalId = String(item?.id || '');
      posts.push({
        externalId,
        caption: item?.desc || '',
        url: item?.id ? `https://www.tiktok.com/@${item?.author?.uniqueId || ''}/video/${item.id}` : '',
        thumbnailUrl: item?.video?.cover || item?.video?.originCover || '',
        publishedAt: item?.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : '',
        views: Number(statsV2?.playCount ?? stats?.playCount ?? 0),
        likes: Number(statsV2?.diggCount ?? stats?.diggCount ?? 0),
        comments: Number(statsV2?.commentCount ?? stats?.commentCount ?? 0),
        shares: Number(statsV2?.shareCount ?? stats?.shareCount ?? 0),
      });
    }

    const hasMore = data?.hasMore ?? data?.has_more;
    cursor = String(data?.cursor ?? '0');
    if (!hasMore || cursor === '0') break;

    // Prevent infinite loop if API keeps returning the same cursor
    if (seenCursors.has(cursor)) {
      console.warn(`[analytics] TikTok posts: duplicate cursor detected (${cursor}), stopping pagination`);
      break;
    }
    seenCursors.add(cursor);
  }

  return posts;
}
