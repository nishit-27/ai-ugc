'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Post } from '@/types';
import { derivePostStatus, isActiveStatus, postMatchesFilter } from '@/lib/postStatus';
import { signUrls } from '@/lib/signedUrlClient';
import { getDateFilterCutoffMs, getDateFilterSortDirection, toMillis } from '@/lib/media-filters';
import type { DateFilterValue } from '@/types/media-filters';
import { usePageVisibility } from './usePageVisibility';

const ACTIVE_POLL_INTERVAL = 2_000;   // 2s when posts are publishing
const IDLE_POLL_INTERVAL = 60_000;    // 60s baseline
const HIDDEN_POLL_INTERVAL = 120_000; // 2m when tab is hidden
const CACHE_KEY = 'ai-ugc-posts-v3';
const VIDEO_MODEL_CACHE_TTL_MS = 60_000;
const EMPTY_RETRY_DELAYS_MS = [300, 700];
const INITIAL_EMPTY_RETRY_INTERVAL_MS = 900;
const INITIAL_EMPTY_GRACE_MS = 20_000;

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

function getCachedPosts(): Post[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

function setCachedPosts(posts: Post[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(posts)); } catch {}
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
    const res = await fetch('/api/videos?mode=generated', { cache: 'no-store' });
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
  const lookup = await getVideoModelLookup(forceLookupRefresh);
  if (lookup.size === 0) return posts;

  return posts.map((post) => {
    const match = findPostModelInfo(post, lookup);
    if (!match) return post;
    return {
      ...post,
      modelId: match.modelId,
      modelName: match.modelName,
    };
  });
}

function getPostTimeMs(post: Post): number {
  return toMillis(post.createdAt || post.updatedAt || post.publishedAt || post.scheduledFor || null);
}

async function signPostMedia(posts: Post[]): Promise<Post[]> {
  const urlsToSign = new Set<string>();
  for (const post of posts) {
    for (const media of post.mediaItems || []) {
      if (media.url?.includes('storage.googleapis.com')) urlsToSign.add(media.url);
      if (media.thumbnailUrl?.includes('storage.googleapis.com')) urlsToSign.add(media.thumbnailUrl);
    }
  }
  if (urlsToSign.size === 0) return posts;

  let signed: Map<string, string>;
  try {
    signed = await signUrls(Array.from(urlsToSign));
  } catch {
    return posts;
  }

  return posts.map((post) => ({
    ...post,
    mediaItems: (post.mediaItems || []).map((media) => ({
      ...media,
      url: media.url ? (signed.get(media.url) || media.url) : media.url,
      thumbnailUrl: media.thumbnailUrl ? (signed.get(media.thumbnailUrl) || media.thumbnailUrl) : media.thumbnailUrl,
    })),
  }));
}

async function fetchPostsOnce(signal: AbortSignal, forceModelRefresh = false): Promise<Post[] | null> {
  const endpoint = '/api/late/posts';
  const res = await fetch(endpoint, { signal, cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const signedPosts: Post[] = await signPostMedia(data.posts || []);
  return enrichPostsWithModelInfo(signedPosts, forceModelRefresh);
}

export function usePosts(options: UsePostsOptions = {}) {
  const selectedModelId = options.modelId || 'all';
  const selectedDateFilter = options.dateFilter || 'newest';

  const [postsFilter, setPostsFilter] = useState<string>('all');
  const isPageVisible = usePageVisibility();

  // Initialize from cache instantly to avoid blocking UI on slow network
  const [postsAll, setPostsAll] = useState<Post[]>(() => getCachedPosts() || []);
  const [isLoadingPage, setIsLoadingPage] = useState(() => {
    const cached = getCachedPosts();
    return !(cached && cached.length > 0);
  });

  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyBootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const firstLoadStartedAtRef = useRef<number>(Date.now());
  const postsRef = useRef(postsAll);
  const wasVisibleRef = useRef(isPageVisible);
  postsRef.current = postsAll;

  const loadPosts = useCallback(async (forceModelRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    let keepLoadingForBootstrap = false;
    const withinInitialGrace = () =>
      Date.now() - firstLoadStartedAtRef.current < INITIAL_EMPTY_GRACE_MS;

    const scheduleBootstrapRetry = () => {
      if (!withinInitialGrace()) return;
      keepLoadingForBootstrap = true;
      if (emptyBootstrapTimerRef.current) clearTimeout(emptyBootstrapTimerRef.current);
      emptyBootstrapTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        void loadPosts(forceModelRefresh);
      }, INITIAL_EMPTY_RETRY_INTERVAL_MS);
    };
    try {
      if (!mountedRef.current) return;
      const fetchWithTimeout = async () => {
        const timeout = setTimeout(() => ac.abort(), 15_000);
        try {
          return await fetchPostsOnce(ac.signal, forceModelRefresh);
        } finally {
          clearTimeout(timeout);
        }
      };

      let arr = await fetchWithTimeout();
      if (!arr || !mountedRef.current || ac.signal.aborted) return;

      if (arr.length === 0) {
        for (const delay of EMPTY_RETRY_DELAYS_MS) {
          if (ac.signal.aborted || !mountedRef.current) return;
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (ac.signal.aborted || !mountedRef.current) return;
          const retry = await fetchWithTimeout();
          if (!retry || ac.signal.aborted || !mountedRef.current) return;
          arr = retry;
          if (arr.length > 0) break;
        }
      }

      // Keep prior content visible when API momentarily returns empty.
      if (arr.length === 0 && postsRef.current.length > 0) return;

      const snapshot = arr.map((p) => {
        const normalizedStatus = p.derivedStatus || derivePostStatus(p);
        const platformState = p.platforms
          ?.map((platform) => `${platform.platform}:${platform.status || ''}:${platform.platformPostUrl || ''}`)
          .sort()
          .join(',') || '';

        return [
          p._id,
          p.status || '',
          normalizedStatus,
          p.modelId || '',
          p.updatedAt || '',
          p.publishedAt || '',
          p.scheduledFor || '',
          platformState,
          p.content?.slice(0, 40) || '',
        ].join(':');
      }).join('|');

      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setPostsAll(arr);
        setCachedPosts(arr);
      }

      if (arr.length === 0 && postsRef.current.length === 0) {
        scheduleBootstrapRetry();
      }
    } catch {
      // Keep cached posts visible on transient fetch failures.
      if (postsRef.current.length === 0) {
        scheduleBootstrapRetry();
      }
    } finally {
      if (!mountedRef.current) return;
      if (keepLoadingForBootstrap) {
        setIsLoadingPage(true);
      } else {
        setIsLoadingPage(false);
      }
    }
  }, []);

  // Adaptive polling
  const scheduleNext = useCallback(() => {
    if (!mountedRef.current) return;
    let delay = HIDDEN_POLL_INTERVAL;
    if (isPageVisible) {
      const hasActive = postsRef.current.some((post) => {
        const status = post.derivedStatus || derivePostStatus(post);
        return isActiveStatus(status)
          || isActiveStatus(post.status)
          || post.platforms?.some((platform) => isActiveStatus(platform.status));
      });
      delay = hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await loadPosts();
      scheduleNext();
    }, delay);
  }, [isPageVisible, loadPosts]);

  useEffect(() => {
    if ((getCachedPosts() || []).length === 0) setIsLoadingPage(true);
    loadPosts().then(scheduleNext);
  }, [loadPosts, scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    firstLoadStartedAtRef.current = Date.now();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (emptyBootstrapTimerRef.current) clearTimeout(emptyBootstrapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduleNext();
  }, [isPageVisible, scheduleNext]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isPageVisible;
    if (!wasVisible && isPageVisible) {
      void loadPosts();
    }
  }, [isPageVisible, loadPosts]);

  // Duplicate detection: per-account, check last 5 posts — if 2+ share the same caption, mark as duplicate
  // Returns both a quick-lookup Set and a detailed Map with sibling links per platform
  const { duplicateIds, duplicateMap } = useMemo(() => {
    type AcctEntry = { postId: string; caption: string; timeMs: number; platformPostUrl?: string };
    // Group posts by each platform account they target
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
      // Sort newest first, take last 5
      entries.sort((a, b) => b.timeMs - a.timeMs);
      const recent = entries.slice(0, 5);
      // Group by caption within these 5
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
          // Add siblings (the OTHER posts in this group) to this post's duplicate map
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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    lastSnapshotRef.current = '';
    await loadPosts(true);
    scheduleNext();
  }, [loadPosts, scheduleNext]);

  return { posts, postsFilter, setPostsFilter, isLoadingPage, refresh, duplicateIds, duplicateMap };
}
