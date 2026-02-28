'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { getDateFilterCutoffMs, getDateFilterSortDirection, toMillis } from '@/lib/media-filters';
import type { DateFilterValue } from '@/types/media-filters';

const PER_PAGE = 24;
const CACHE_TTL_MS = 60_000;

type ApiVideo = {
  name?: string;
  path?: string;
  url?: string;
  size?: number | null;
  created?: string | null;
  jobId?: string | null;
  createdBy?: string | null;
  modelId?: string | null;
  modelName?: string | null;
};

export type GeneratedVideo = {
  id: string;
  filename: string;
  gcsUrl: string;
  signedUrl?: string;
  fileSize?: number | null;
  createdAt: string;
  jobId?: string | null;
  createdBy?: string | null;
  modelId?: string | null;
  modelName?: string | null;
};

let _cache: GeneratedVideo[] = [];
let _cacheTime = 0;

type UseGeneratedVideosOptions = {
  modelId?: string;
  dateFilter?: DateFilterValue;
};

function normalizeVideo(item: ApiVideo, idx: number): GeneratedVideo | null {
  const gcsUrl = item.path || item.url || '';
  if (!gcsUrl) return null;
  return {
    id: gcsUrl || `${item.jobId || 'video'}-${idx}`,
    filename: item.name || `video-${idx + 1}.mp4`,
    gcsUrl,
    signedUrl: gcsUrl,
    fileSize: item.size ?? null,
    createdAt: item.created || new Date(0).toISOString(),
    jobId: item.jobId || null,
    createdBy: item.createdBy || null,
    modelId: item.modelId || null,
    modelName: item.modelName || null,
  };
}

export function useGeneratedVideos(options: UseGeneratedVideosOptions = {}) {
  const selectedModelId = options.modelId || 'all';
  const selectedDateFilter = options.dateFilter || 'newest';
  const [allVideos, setAllVideos] = useState<GeneratedVideo[]>(_cache);
  const [page, setPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(_cache.length === 0);

  const filteredVideos = useMemo(() => {
    const cutoff = getDateFilterCutoffMs(selectedDateFilter);
    const sortDirection = getDateFilterSortDirection(selectedDateFilter);

    const filtered = allVideos.filter((video) => {
      if (selectedModelId !== 'all' && video.modelId !== selectedModelId) return false;
      if (cutoff !== null && toMillis(video.createdAt) < cutoff) return false;
      return true;
    });

    return filtered.sort((a, b) =>
      sortDirection === 'desc'
        ? toMillis(b.createdAt) - toMillis(a.createdAt)
        : toMillis(a.createdAt) - toMillis(b.createdAt)
    );
  }, [allVideos, selectedModelId, selectedDateFilter]);

  const total = filteredVideos.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [selectedModelId, selectedDateFilter]);

  const videos = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filteredVideos.slice(start, start + PER_PAGE);
  }, [filteredVideos, page]);

  const loadVideos = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < CACHE_TTL_MS) {
      setAllVideos(_cache);
      setIsLoadingPage(false);
      return;
    }

    setIsLoadingPage(true);
    try {
      const res = await fetch('/api/videos?mode=generated');
      const data = await res.json();
      const rows: ApiVideo[] = Array.isArray(data.videos) ? data.videos : [];

      const normalized = rows
        .map((row, idx) => normalizeVideo(row, idx))
        .filter((row): row is GeneratedVideo => row !== null)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

      _cache = normalized;
      _cacheTime = Date.now();
      setAllVideos(normalized);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const refresh = useCallback(() => loadVideos(true), [loadVideos]);

  return { videos, isLoadingPage, refresh, page, setPage, totalPages, total };
}
