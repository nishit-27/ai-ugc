'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signUrls } from '@/lib/signedUrlClient';
import type { GeneratedImage } from '@/types';

const PER_PAGE = 24;
const CACHE_KEY = 'ai-ugc-generated-images-pages-v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedPage = {
  images: GeneratedImage[];
  total: number;
  ts: number;
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

function getCachedPage(page: number): CachedPage | null {
  const cache = readPageCache();
  const entry = cache[String(page)];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry;
}

function setCachedPage(page: number, payload: { images: GeneratedImage[]; total: number }) {
  try {
    const cache = readPageCache();
    cache[String(page)] = { ...payload, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage failures.
  }
}

export function useGeneratedImages() {
  const [images, setImages] = useState<GeneratedImage[]>(() => getCachedPage(1)?.images || []);
  const [total, setTotal] = useState(() => getCachedPage(1)?.total || 0);
  const [page, setPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(() => !getCachedPage(1));
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const loadingTotalRef = useRef(false);
  const totalRef = useRef(total);

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

    const cached = getCachedPage(p);
    if (cached && showLoader) {
      setImages(cached.images);
      setTotal(cached.total);
      // Avoid flashing "No images yet" while first fetch is still in-flight.
      setIsLoadingPage(cached.images.length === 0 && cached.total === 0);
    } else if (showLoader) {
      setIsLoadingPage(true);
    }

    try {
      const res = await fetch(`/api/generated-images?page=${p}&limit=${PER_PAGE}&fast=true&signed=false`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      const data = await res.json();

      if (!mountedRef.current) return;

      const result: GeneratedImage[] = Array.isArray(data.images) ? data.images : [];
      const totalFromApi = typeof data.total === 'number' ? data.total : null;

      // Some environments return a stale empty list on first navigation; auto-retry once.
      if (retryOnEmpty && result.length === 0 && totalFromApi === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (!mountedRef.current) return;
        await loadPage(p, false, false);
        return;
      }

      if (typeof totalFromApi === 'number') {
        setTotal(totalFromApi);
      }
      setImages(result);
      setIsLoadingPage(false);
      setCachedPage(p, { images: result, total: typeof totalFromApi === 'number' ? totalFromApi : totalRef.current });

      // Sign only missing URLs (API may already return cached signedUrl values).
      const gcsUrls = result
        .filter((img) => !img.signedUrl)
        .map((img) => img.gcsUrl)
        .filter((url) => url?.includes('storage.googleapis.com'));

      if (gcsUrls.length > 0) {
        const signed = await signUrls(gcsUrls);
        if (!mountedRef.current) return;
        setImages((prev) => {
          const signedImages = prev.map((img) => ({
            ...img,
            signedUrl: signed.get(img.gcsUrl) || img.gcsUrl,
          }));
          setCachedPage(p, { images: signedImages, total: typeof totalFromApi === 'number' ? totalFromApi : totalRef.current });
          return signedImages;
        });
      }

      // Fetch total count in background so initial card render is not blocked.
      if (typeof totalFromApi !== 'number' && !loadingTotalRef.current) {
        loadingTotalRef.current = true;
        fetch('/api/generated-images?countOnly=true', { cache: 'no-store' })
          .then((r) => r.json())
          .then((countData) => {
            if (!mountedRef.current) return;
            if (typeof countData.total === 'number') {
              setTotal(countData.total);
              setCachedPage(p, { images: result, total: countData.total });
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
      if (mountedRef.current) setIsLoadingPage(false);
    }
  }, []);

  // Load when page changes
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
