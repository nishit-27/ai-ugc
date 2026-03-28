import { config } from './config';

const HOST = 'twitter154.p.rapidapi.com';

function getHeaders() {
  return {
    'x-rapidapi-host': HOST,
    'x-rapidapi-key': config.RAPIDAPI_KEY || '',
  };
}

// ── Types ──

export interface TwitterPost {
  tweet_id: string;
  text: string;
  username: string;
  name: string;
  profile_pic_url: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  views: number;
  media_url: string | null;
  created_at: string;
  is_quote: boolean;
  quoted_text?: string;
  quoted_username?: string;
}

interface RawTweet {
  tweet_id: string;
  text: string;
  user: {
    username: string;
    name: string;
    profile_pic_url: string;
  };
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  views: number;
  media_url: string[] | null;
  creation_date: string;
  quoted_status?: {
    text: string;
    user: { username: string };
  } | null;
  retweet: boolean;
}

function mapTweet(t: RawTweet): TwitterPost {
  return {
    tweet_id: t.tweet_id,
    text: t.text,
    username: t.user.username,
    name: t.user.name,
    profile_pic_url: t.user.profile_pic_url,
    favorite_count: t.favorite_count,
    retweet_count: t.retweet_count,
    reply_count: t.reply_count,
    views: t.views || 0,
    media_url: t.media_url?.[0] || null,
    created_at: t.creation_date,
    is_quote: !!t.quoted_status,
    quoted_text: t.quoted_status?.text,
    quoted_username: t.quoted_status?.user?.username,
  };
}

// ── Search viral tweets ──

export async function searchViralTweets(
  query: string,
  minLikes = 500,
  limit = 10
): Promise<TwitterPost[]> {
  const url = new URL(`https://${HOST}/search/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('section', 'top');
  url.searchParams.set('min_likes', String(minLikes));
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) throw new Error(`Twitter search failed: ${res.status}`);

  const data = await res.json();
  const tweets: RawTweet[] = data.results || [];
  return tweets.filter((t) => !t.retweet).map(mapTweet);
}

// ── Get trending topics ──

export async function getTrending(
  woeid = 23424848
): Promise<{ name: string; query: string; tweet_volume: number | null }[]> {
  const res = await fetch(`https://${HOST}/trends/?woeid=${woeid}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Trends failed: ${res.status}`);

  const data = await res.json();
  const trends = data[0]?.trends || [];
  return trends
    .slice(0, 20)
    .map(
      (t: { name: string; query: string; tweet_volume: number | null }) => ({
        name: t.name,
        query: t.query,
        tweet_volume: t.tweet_volume,
      })
    );
}

// ── Get user tweets ──

export async function getUserTweets(
  username: string,
  limit = 10
): Promise<TwitterPost[]> {
  const url = new URL(`https://${HOST}/user/tweets`);
  url.searchParams.set('username', username);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('include_replies', 'false');

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) throw new Error(`User tweets failed: ${res.status}`);

  const data = await res.json();
  const tweets: RawTweet[] = data.results || [];
  return tweets.filter((t) => !t.retweet).map(mapTweet);
}

// ── Fetch a single tweet by ID ──

export async function fetchTweetById(
  tweetId: string
): Promise<TwitterPost | null> {
  const url = new URL(`https://${HOST}/tweet/details`);
  url.searchParams.set('tweet_id', tweetId);

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) return null;

  const data = await res.json();
  if (!data?.tweet_id && !data?.user) return null;

  return mapTweet(data as RawTweet);
}

// ── Parse tweet ID from URL ──

export function parseTweetIdFromUrl(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match?.[1] || null;
}

// ── Fetch tweet by URL ──

export async function fetchTweetByUrl(
  tweetUrl: string
): Promise<TwitterPost | null> {
  const tweetId = parseTweetIdFromUrl(tweetUrl);
  if (!tweetId) return null;
  return fetchTweetById(tweetId);
}
