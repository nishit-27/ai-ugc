import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { lateApiRequest } from '@/lib/lateApi';
import { fetchFromAllKeys, getAccountLabel } from '@/lib/lateAccountPool';
import { derivePostStatus, hasPublishedPlatformWithoutUrl, postMatchesFilter } from '@/lib/postStatus';
import type { Post, PostPlatform } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const LINK_HYDRATE_CONCURRENCY = 3;
const MAX_LINK_HYDRATE_POSTS = 8;

type LatePlatform = {
  platform: string;
  accountId?: string | { _id: string };
  status?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  publishedAt?: string;
  errorMessage?: string;
  errorCategory?: string;
  errorSource?: string;
};

type LateMediaItem = {
  type?: string;
  url?: string;
  thumbnailUrl?: string;
};

type LatePost = {
  _id: string;
  title?: string;
  content?: string;
  status?: string;
  scheduledFor?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  mediaItems?: LateMediaItem[];
  platforms?: LatePlatform[];
  apiKeyIndex?: number;
};

function extractPosts(payload: unknown): LatePost[] {
  if (!payload || typeof payload !== 'object') return [];
  const asObject = payload as { posts?: unknown };
  return Array.isArray(asObject.posts) ? (asObject.posts as LatePost[]) : [];
}

function extractSinglePost(payload: unknown): LatePost | null {
  if (!payload || typeof payload !== 'object') return null;
  const asObject = payload as { post?: unknown; _id?: unknown };
  if (asObject.post && typeof asObject.post === 'object') return asObject.post as LatePost;
  if (typeof asObject._id === 'string') return asObject as LatePost;
  return null;
}

function normalizePost(post: LatePost): Post {
  const platforms: PostPlatform[] = (post.platforms || []).map((platform) => ({
    platform: platform.platform,
    accountId: platform.accountId,
    status: platform.status,
    platformPostId: platform.platformPostId,
    platformPostUrl: platform.platformPostUrl,
    publishedAt: platform.publishedAt,
    errorMessage: platform.errorMessage,
    errorCategory: platform.errorCategory,
    errorSource: platform.errorSource,
  }));

  const normalized: Post = {
    _id: post._id,
    title: post.title,
    content: post.content,
    status: post.status,
    derivedStatus: derivePostStatus({ status: post.status, platforms }),
    scheduledFor: post.scheduledFor,
    timezone: post.timezone,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
    mediaItems: (post.mediaItems || []).map((media) => ({
      type: media.type,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
    })),
    platforms,
    apiKeyIndex: post.apiKeyIndex,
    accountLabel: post.apiKeyIndex !== undefined ? getAccountLabel(post.apiKeyIndex) : undefined,
  };

  return normalized;
}

async function hydratePostLinks(posts: LatePost[]): Promise<LatePost[]> {
  const candidates = posts
    .filter((post) => hasPublishedPlatformWithoutUrl({ status: post.status, platforms: post.platforms }))
    .slice(0, MAX_LINK_HYDRATE_POSTS);

  if (candidates.length === 0) return posts;

  const hydrated = new Map<string, LatePost>();

  for (let i = 0; i < candidates.length; i += LINK_HYDRATE_CONCURRENCY) {
    const chunk = candidates.slice(i, i + LINK_HYDRATE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (post) => {
        const apiKey = post.apiKeyIndex !== undefined ? config.LATE_API_KEYS[post.apiKeyIndex] : undefined;
        try {
          const detailPayload = await lateApiRequest(`/posts/${post._id}`, {
            timeout: 6_000,
            retries: 0,
            apiKey,
          });
          const detailPost = extractSinglePost(detailPayload);
          if (detailPost?._id) {
            detailPost.apiKeyIndex = post.apiKeyIndex;
            hydrated.set(detailPost._id, detailPost);
          }
        } catch {
          // Silently continue if hydration fails
        }
      })
    );
  }

  if (hydrated.size === 0) return posts;
  return posts.map((post) => hydrated.get(post._id) || post);
}

export async function GET(request: NextRequest) {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    const rawStatusFilter = (request.nextUrl.searchParams.get('status') || 'all').toLowerCase();
    const statusFilter = ['all', 'published', 'scheduled', 'draft', 'failed'].includes(rawStatusFilter)
      ? rawStatusFilter
      : 'all';
    const platformFilter = (request.nextUrl.searchParams.get('platform') || '').toLowerCase();

    // Fetch all posts from all API keys in parallel
    const results = await fetchFromAllKeys<{ posts?: LatePost[] }>('/posts?limit=10000', {
      timeout: 10_000,
      retries: 1,
    });

    const allPosts: LatePost[] = [];
    for (const { apiKeyIndex, data } of results) {
      for (const post of extractPosts(data)) {
        post.apiKeyIndex = apiKeyIndex;
        allPosts.push(post);
      }
    }

    // Sort by createdAt descending
    allPosts.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    const hydratedPosts = await hydratePostLinks(allPosts);

    const normalized = hydratedPosts
      .map(normalizePost)
      .filter((post) => (platformFilter
        ? post.platforms?.some((platform) => (platform.platform || '').toLowerCase() === platformFilter)
        : true))
      .filter((post) => postMatchesFilter(post, statusFilter));

    return NextResponse.json(
      { posts: normalized },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
