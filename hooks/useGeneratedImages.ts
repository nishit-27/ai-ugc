'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signUrls } from '@/lib/signedUrlClient';
import type { GeneratedImage } from '@/types';

const PER_PAGE = 24;

export function useGeneratedImages() {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadPage = useCallback(async (p: number, showLoader = true) => {
    if (showLoader) setIsLoadingPage(true);
    try {
      const res = await fetch(`/api/generated-images?page=${p}&limit=${PER_PAGE}`);
      const data = await res.json();

      if (!mountedRef.current) return;

      const result: GeneratedImage[] = Array.isArray(data.images) ? data.images : [];
      setTotal(data.total ?? 0);
      setImages(result);
      setIsLoadingPage(false);

      // Batch-sign only this page's URLs (fast — max 24 images)
      const gcsUrls = result
        .map((img) => img.gcsUrl)
        .filter((url) => url?.includes('storage.googleapis.com'));

      if (gcsUrls.length > 0) {
        const signed = await signUrls(gcsUrls);
        if (!mountedRef.current) return;
        setImages((prev) =>
          prev.map((img) => ({
            ...img,
            signedUrl: signed.get(img.gcsUrl) || img.gcsUrl,
          }))
        );
      }
    } catch (e) {
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

  const refresh = useCallback(() => loadPage(page, false), [page, loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return { images, isLoadingPage, refresh, deleteImage, page, setPage, totalPages, total };
}
