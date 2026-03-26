'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Post } from '@/types';
import { derivePostStatus, isActiveStatus, postMatchesFilter } from '@/lib/postStatus';
import { getDateFilterCutoffMs, getDateFilterSortDirection, toMillis } from '@/lib/media-filters';
import type { DateFilterValue } from '@/types/media-filters';

type UsePostsOptions = {
  modelId?: string;
  dateFilter?: DateFilterValue;
};

type VideoModelInfo = {
  modelId?: string;
  modelName?: string;
};

type ApiVideoRow = {
  path?: string;
  url?: string;
  modelId?: string | null;
  modelName?: string | null;
};

let _videoModelLookupCache = new Map<string, VideoModelInfo>();
let _videoModelLookupTs = 0;
const VIDEO_MODEL_CACHE_TTL_MS = 60_000;

// Account→Model map cache (primary enrichment source)
let _accountModelMapCache: Record<string, { modelId: string; modelName: string }> = {};
let _accountModelMapTs = 0;
const ACCOUNT_MODEL_MAP_TTL_MS = 5 * 60_000;

async function getAccountModelMap(force = false): Promise<Record<string, { modelId: string; modelName: string }>> {
  const now = Date.now();
  if (!force && Object.keys(_accountModelMapCache).length > 0 && now - _accountModelMapTs < ACCOUNT_MODEL_MAP_TTL_MS) {
    return _accountModelMapCache;
  }
  try {
    const res = await fetch('/api/accounts/model-map');
    if (!res.ok) return _accountModelMapCache;
    const data = await res.json();
    _accountModelMapCache = data;
    _accountModelMapTs = Date.now();
    return data;
  } catch {
    return _accountModelMapCache;
  }
}

function getAccountId(accountId: string | { _id: string } | undefined): string {
  if (!accountId) return '';
  return typeof accountId === 'object' ? accountId._id : accountId;
}

function enrichPostFromAccountMap(
  post: Post,
  accountMap: Record<string, { modelId: string; modelName: string }>
): Post {
  if (post.modelId && post.modelName) return post;
  for (const plat of post.platforms || []) {
    const acctId = getAccountId(plat.accountId);
    if (acctId && accountMap[acctId]) {
      return { ...post, modelId: accountMap[acctId].modelId, modelName: accountMap[acctId].modelName };
    }
  }
  return post;
}

function canonicalUrlKey(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    const stripped = trimmed.split('?')[0]?.split('#')[0]?.trim();
    return stripped ? stripped.toLowerCase() : null;
  }
}

function filenameKey(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const canonical = canonicalUrlKey(rawUrl);
  if (!canonical) return null;
  const parts = canonical.split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

function addVideoLookupEntry(map: Map<string, VideoModelInfo>, rawUrl: string | undefined, info: VideoModelInfo) {
  if (!rawUrl || (!info.modelId && !info.modelName)) return;
  const urlKey = canonicalUrlKey(rawUrl);
  if (urlKey && !map.has(urlKey)) map.set(urlKey, info);
  const fileKey = filenameKey(rawUrl);
  if (fileKey && !map.has(fileKey)) map.set(fileKey, info);
}

async function getVideoModelLookup(force = false): Promise<Map<string, VideoModelInfo>> {
  const now = Date.now();
  if (!force && _videoModelLookupCache.size > 0 && now - _videoModelLookupTs < VIDEO_MODEL_CACHE_TTL_MS) {
    return _videoModelLookupCache;
  }

  try {
    const res = await fetch('/api/videos?mode=generated');
    if (!res.ok) return _videoModelLookupCache;

    const data = await res.json();
    const rows: ApiVideoRow[] = Array.isArray(data.videos) ? data.videos : [];
    const next = new Map<string, VideoModelInfo>();

    for (const row of rows) {
      const info: VideoModelInfo = {
        modelId: row.modelId || undefined,
        modelName: row.modelName || undefined,
      };
      addVideoLookupEntry(next, row.path, info);
      addVideoLookupEntry(next, row.url, info);
    }

    _videoModelLookupCache = next;
    _videoModelLookupTs = Date.now();
    return next;
  } catch {
    return _videoModelLookupCache;
  }
}

function findPostModelInfo(post: Post, lookup: Map<string, VideoModelInfo>): VideoModelInfo | null {
  const mediaItems = post.mediaItems || [];
  for (const media of mediaItems) {
    const candidates = [media.url, media.thumbnailUrl];
    for (const candidate of candidates) {
      const urlKey = canonicalUrlKey(candidate);
      if (urlKey && lookup.has(urlKey)) return lookup.get(urlKey) || null;
      const fileKey = filenameKey(candidate);
      if (fileKey && lookup.has(fileKey)) return lookup.get(fileKey) || null;
    }
  }
  return null;
}

async function enrichPostsWithModelInfo(posts: Post[], forceLookupRefresh = false): Promise<Post[]> {
  if (posts.length === 0) return posts;

  // Primary: account→model mapping (reliable, DB-backed)
  const accountMap = await getAccountModelMap(forceLookupRefresh);

  // Secondary fallback: URL-based video lookup
  const videoLookup = await getVideoModelLookup(forceLookupRefresh);

  return posts.map((post) => {
    // Try account map first
    const enriched = enrichPostFromAccountMap(post, accountMap);
    if (enriched.modelId && enriched.modelName) return enriched;

    // Fall back to URL matching
    if (videoLookup.size > 0) {
      const match = findPostModelInfo(post, videoLookup);
      if (match) {
        return { ...post, modelId: match.modelId, modelName: match.modelName };
      }
    }

    return post;
  });
}

function getPostTimeMs(post: Post): number {
  return toMillis(post.createdAt || post.updatedAt || post.publishedAt || post.scheduledFor || null);
}

async function fetchPostsOnce(signal: AbortSignal): Promise<Post[] | null> {
  const endpoint = '/api/late/posts';
  const res = await fetch(endpoint, { signal, cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.posts || [];
}

export function usePosts(options: UsePostsOptions = {}) {
  const selectedModelId = options.modelId || 'all';
  const selectedDateFilter = options.dateFilter || 'newest';

  const [postsFilter, setPostsFilter] = useState<string>('all');

  // Start empty — no stale localStorage cache. Show loading until fresh data arrives.
  const [postsAll, setPostsAll] = useState<Post[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const loadPosts = useCallback(async (forceModelRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      if (!mountedRef.current) return;

      const timeout = setTimeout(() => ac.abort(), 15_000);
      let arr: Post[] | null;
      try {
        arr = await fetchPostsOnce(ac.signal);
      } finally {
        clearTimeout(timeout);
      }

      if (!arr || !mountedRef.current || ac.signal.aborted) return;

      // Enrich with model info inline (single state update)
      const enriched = await enrichPostsWithModelInfo(arr, forceModelRefresh);
      if (!mountedRef.current || ac.signal.aborted) return;

      setPostsAll(enriched);
    } catch {
      // Keep current posts visible on transient fetch failures
    } finally {
      if (mountedRef.current) {
        setIsLoadingPage(false);
      }
    }
  }, []);

  // Mount: fetch once
  useEffect(() => {
    mountedRef.current = true;
    setIsLoadingPage(true);
    loadPosts();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duplicate detection
  const { duplicateIds, duplicateMap } = useMemo(() => {
    type AcctEntry = { postId: string; caption: string; timeMs: number; platformPostUrl?: string };
    const accountPosts = new Map<string, { platform: string; entries: AcctEntry[] }>();
    for (const post of postsAll) {
      const caption = (post.content || '').trim().toLowerCase();
      if (!caption) continue;
      const timeMs = getPostTimeMs(post);
      for (const plat of post.platforms || []) {
        const acctId = typeof plat.accountId === 'string' ? plat.accountId : plat.accountId?._id;
        if (!acctId) continue;
        const key = `${plat.platform}\0${acctId}`;
        let bucket = accountPosts.get(key);
        if (!bucket) { bucket = { platform: plat.platform, entries: [] }; accountPosts.set(key, bucket); }
        bucket.entries.push({ postId: post._id, caption, timeMs, platformPostUrl: plat.platformPostUrl });
      }
    }

    const ids = new Set<string>();
    const map = new Map<string, { platform: string; postId: string; url?: string; createdAt?: string }[]>();

    for (const { platform, entries } of accountPosts.values()) {
      entries.sort((a, b) => b.timeMs - a.timeMs);
      const recent = entries.slice(0, 5);
      const captionGroups = new Map<string, AcctEntry[]>();
      for (const entry of recent) {
        const group = captionGroups.get(entry.caption);
        if (group) group.push(entry);
        else captionGroups.set(entry.caption, [entry]);
      }
      for (const group of captionGroups.values()) {
        if (group.length < 2) continue;
        for (const entry of group) {
          ids.add(entry.postId);
          const siblings = group
            .filter((s) => s.postId !== entry.postId)
            .map((s) => ({
              platform,
              postId: s.postId,
              url: s.platformPostUrl,
              createdAt: s.timeMs ? new Date(s.timeMs).toISOString() : undefined,
            }));
          const existing = map.get(entry.postId);
          if (existing) existing.push(...siblings);
          else map.set(entry.postId, [...siblings]);
        }
      }
    }
    return { duplicateIds: ids, duplicateMap: map };
  }, [postsAll]);

  const posts = useMemo(() => {
    const cutoff = getDateFilterCutoffMs(selectedDateFilter);
    const sortDirection = getDateFilterSortDirection(selectedDateFilter);

    const filtered = postsAll
      .filter((post) => {
        if (postsFilter === 'duplicate') return duplicateIds.has(post._id);
        return postMatchesFilter(post, postsFilter);
      })
      .filter((post) => selectedModelId === 'all' || post.modelId === selectedModelId)
      .filter((post) => {
        if (cutoff === null) return true;
        return getPostTimeMs(post) >= cutoff;
      });

    return filtered.sort((a, b) =>
      sortDirection === 'desc'
        ? getPostTimeMs(b) - getPostTimeMs(a)
        : getPostTimeMs(a) - getPostTimeMs(b)
    );
  }, [postsAll, postsFilter, selectedModelId, selectedDateFilter, duplicateIds]);

  const refresh = useCallback(async () => {
    setIsLoadingPage(true);
    await loadPosts(true);
  }, [loadPosts]);

  return { posts, postsFilter, setPostsFilter, isLoadingPage, refresh, duplicateIds, duplicateMap };
}
