'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getDateFilterSortDirection } from '@/lib/media-filters';
import type { GeneratedImage } from '@/types';
import type { DateFilterValue } from '@/types/media-filters';

const PER_PAGE = 24;
const CACHE_KEY = 'ai-ugc-generated-images-pages-v2';
const CACHE_TTL_MS = 10 * 60 * 1000;
const EMPTY_RETRY_DELAYS_MS = [300, 700];

type CachedPage = {
  images: GeneratedImage[];
  total: number;
  ts: number;
};

type UseGeneratedImagesOptions = {
  modelId?: string;
  dateFilter?: DateFilterValue;
};

type NormalizedFilters = {
  modelId: string;
  dateFilter: DateFilterValue;
};

function readPageCache(): Record<string, CachedPage> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedPage>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getFilterCacheKey(filters: NormalizedFilters): string {
  const modelKey = filters.modelId || 'all';
  return `${modelKey}|${filters.dateFilter}`;
}

function getCachedPage(page: number, filters: NormalizedFilters): CachedPage | null {
  const cache = readPageCache();
  const entry = cache[`${getFilterCacheKey(filters)}|${page}`];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry;
}

function setCachedPage(page: number, filters: NormalizedFilters, payload: { images: GeneratedImage[]; total: number }) {
  try {
    const cache = readPageCache();
    cache[`${getFilterCacheKey(filters)}|${page}`] = { ...payload, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage failures.
  }
}

/** Ensure every image has a displayable URL (R2 URLs are public). */
function withResolvedUrls(images: GeneratedImage[]): GeneratedImage[] {
  return images.map((img) => ({
    ...img,
    signedUrl: img.signedUrl || img.gcsUrl || undefined,
  }));
}

function buildQuery(page: number, filters: NormalizedFilters, options: { countOnly?: boolean } = {}) {
  const params = new URLSearchParams();
  const { countOnly = false } = options;

  if (countOnly) {
    params.set('countOnly', 'true');
  } else {
    params.set('page', String(page));
    params.set('limit', String(PER_PAGE));
    params.set('fast', 'true');
    params.set('sort', getDateFilterSortDirection(filters.dateFilter));
  }

  if (filters.modelId) params.set('modelId', filters.modelId);
  if (filters.dateFilter === '24h' || filters.dateFilter === '7d' || filters.dateFilter === '30d') {
    params.set('dateRange', filters.dateFilter);
  }

  return params;
}

export function useGeneratedImages(options: UseGeneratedImagesOptions = {}) {
  const normalizedModelId = options.modelId || '';
  const normalizedDateFilter = options.dateFilter || 'newest';
  const normalizedFilters = useMemo<NormalizedFilters>(() => ({
    modelId: normalizedModelId,
    dateFilter: normalizedDateFilter,
  }), [normalizedModelId, normalizedDateFilter]);

  const [images, setImages] = useState<GeneratedImage[]>(() => getCachedPage(1, normalizedFilters)?.images || []);
  const [total, setTotal] = useState(() => getCachedPage(1, normalizedFilters)?.total || 0);
  const [page, setPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(() => !getCachedPage(1, normalizedFilters));
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const loadingTotalRef = useRef(false);
  const totalRef = useRef(total);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadPage = useCallback(async (p: number, showLoader = true, retryOnEmpty = true) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestToken = ++requestTokenRef.current;

    const isActiveRequest = () =>
      mountedRef.current && requestTokenRef.current === requestToken && !ac.signal.aborted;

    const cached = getCachedPage(p, normalizedFilters);
    if (cached && showLoader) {
      setImages(cached.images);
      setTotal(cached.total);
      setIsLoadingPage(cached.images.length === 0 && cached.total === 0);
    } else if (showLoader) {
      setIsLoadingPage(true);
    }

    try {
      const query = buildQuery(p, normalizedFilters);
      const res = await fetch(`/api/generated-images?${query.toString()}`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      const data = await res.json();

      if (!isActiveRequest()) return;

      const result: GeneratedImage[] = Array.isArray(data.images) ? data.images : [];
      const totalFromApi = typeof data.total === 'number' ? data.total : null;
      const resolvedImages = withResolvedUrls(result);

      if (retryOnEmpty && p === 1 && result.length === 0) {
        let knownCount = totalFromApi;
        if (knownCount === null) {
          try {
            const countQuery = buildQuery(1, normalizedFilters, { countOnly: true });
            const countRes = await fetch(`/api/generated-images?${countQuery.toString()}`, {
              cache: 'no-store',
              signal: ac.signal,
            });
            const countData = await countRes.json();
            if (typeof countData.total === 'number') knownCount = countData.total;
          } catch {
            // Ignore fallback count failures.
          }
        }

        if (knownCount && knownCount > 0) {
          for (const delay of EMPTY_RETRY_DELAYS_MS) {
            if (!isActiveRequest()) return;
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (!isActiveRequest()) return;
            await loadPage(p, false, false);
            return;
          }
        }
      }

      if (typeof totalFromApi === 'number') {
        setTotal(totalFromApi);
      }
      setImages(resolvedImages);
      setIsLoadingPage(false);
      setCachedPage(p, normalizedFilters, {
        images: resolvedImages,
        total: typeof totalFromApi === 'number' ? totalFromApi : totalRef.current,
      });

      if (typeof totalFromApi !== 'number' && !loadingTotalRef.current) {
        loadingTotalRef.current = true;
        const countQuery = buildQuery(1, normalizedFilters, { countOnly: true });
        fetch(`/api/generated-images?${countQuery.toString()}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((countData) => {
            if (!isActiveRequest()) return;
            if (typeof countData.total === 'number') {
              setTotal(countData.total);
              setCachedPage(p, normalizedFilters, { images: resolvedImages, total: countData.total });
            }
          })
          .catch(() => {})
          .finally(() => {
            loadingTotalRef.current = false;
          });
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Failed to load generated images:', e);
    } finally {
      if (mountedRef.current && requestTokenRef.current === requestToken) {
        setIsLoadingPage(false);
      }
    }
  }, [normalizedFilters]);

  useEffect(() => {
    loadPage(page);
  }, [page, loadPage]);

  const deleteImage = useCallback(async (id: string) => {
    const prev = images;
    setImages((imgs) => imgs.filter((img) => img.id !== id));
    setTotal((t) => Math.max(0, t - 1));

    try {
      const res = await fetch(`/api/generated-images/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (e) {
      console.error('Failed to delete image:', e);
      setImages(prev);
      setTotal((t) => t + 1);
    }
  }, [images]);

  const refresh = useCallback(() => loadPage(page, false, false), [page, loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return { images, isLoadingPage, refresh, deleteImage, page, setPage, totalPages, total };
}
