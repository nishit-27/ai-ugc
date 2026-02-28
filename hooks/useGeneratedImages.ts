'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getDateFilterSortDirection } from '@/lib/media-filters';
import type { GeneratedImage } from '@/types';
import type { DateFilterValue } from '@/types/media-filters';

const PER_PAGE = 24;

type UseGeneratedImagesOptions = {
  modelId?: string;
  dateFilter?: DateFilterValue;
};

type NormalizedFilters = {
  modelId: string;
  dateFilter: DateFilterValue;
};

function buildQuery(page: number, filters: NormalizedFilters) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(PER_PAGE));
  params.set('sort', getDateFilterSortDirection(filters.dateFilter));

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

  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadPage = useCallback(async (p: number, showLoader = true) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestToken = ++requestTokenRef.current;

    if (showLoader) setIsLoadingPage(true);

    try {
      const query = buildQuery(p, normalizedFilters);
      const res = await fetch(`/api/generated-images?${query.toString()}`, {
        signal: ac.signal,
      });
      if (!mountedRef.current || requestTokenRef.current !== requestToken) return;

      const data = await res.json();
      const result: GeneratedImage[] = Array.isArray(data.images) ? data.images : [];
      // Ensure every image has a displayable URL.
      const resolved = result.map((img) => ({
        ...img,
        signedUrl: img.signedUrl || img.gcsUrl || undefined,
      }));

      setImages(resolved);
      if (typeof data.total === 'number') setTotal(data.total);
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

  const refresh = useCallback(() => loadPage(page, false), [page, loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return { images, isLoadingPage, refresh, deleteImage, page, setPage, totalPages, total };
}
