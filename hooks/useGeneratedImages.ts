'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GeneratedImage } from '@/types';

const REFRESH_INTERVAL = 60_000;

let _cache: GeneratedImage[] = [];
let _cacheTime = 0;

export function useGeneratedImages() {
  const [images, setImages] = useState<GeneratedImage[]>(_cache);
  const [isLoadingPage, setIsLoadingPage] = useState(_cache.length === 0);

  const loadImages = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < REFRESH_INTERVAL) {
      setImages(_cache);
      setIsLoadingPage(false);
      return;
    }
    try {
      const res = await fetch('/api/generated-images');
      const data = await res.json();
      const result: GeneratedImage[] = Array.isArray(data) ? data : [];
      _cache = result;
      _cacheTime = Date.now();
      setImages(result);
    } catch (e) {
      console.error('Failed to load generated images:', e);
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  const deleteImage = useCallback(async (id: string) => {
    // Optimistic removal
    const prev = _cache;
    _cache = _cache.filter((img) => img.id !== id);
    setImages(_cache);

    try {
      const res = await fetch(`/api/generated-images/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (e) {
      console.error('Failed to delete image:', e);
      // Rollback
      _cache = prev;
      setImages(prev);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    const id = setInterval(() => loadImages(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [loadImages]);

  const refresh = useCallback(() => loadImages(true), [loadImages]);

  return { images, isLoadingPage, refresh, deleteImage };
}
