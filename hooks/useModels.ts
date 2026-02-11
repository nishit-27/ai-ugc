'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Model, ModelImage } from '@/types';

const REFRESH_INTERVAL = 60_000;

// Module-level caches
let _cache: Model[] = [];
let _cacheTime = 0;
const _imageCache = new Map<string, ModelImage[]>();

// Client-side signed URL cache for images
const _signedImageCache = new Map<string, string>();
const _pendingImageUrls = new Set<string>();

async function signImageUrl(gcsUrl: string): Promise<string | null> {
  if (_signedImageCache.has(gcsUrl)) return _signedImageCache.get(gcsUrl)!;
  if (_pendingImageUrls.has(gcsUrl)) return null;
  _pendingImageUrls.add(gcsUrl);
  try {
    const res = await fetch(`/api/signed-url?url=${encodeURIComponent(gcsUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.signedUrl) {
      _signedImageCache.set(gcsUrl, data.signedUrl);
      return data.signedUrl;
    }
  } catch {} finally {
    _pendingImageUrls.delete(gcsUrl);
  }
  return null;
}

export function useModels() {
  const [models, setModels] = useState<Model[]>(_cache);
  const [modelImages, setModelImages] = useState<ModelImage[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(_cache.length === 0);
  const [imagesLoading, setImagesLoading] = useState(false);

  const loadModels = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < REFRESH_INTERVAL) {
      setModels(_cache);
      setIsLoadingPage(false);
      return;
    }
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const result = Array.isArray(data) ? data : [];
      _cache = result;
      _cacheTime = Date.now();
      setModels(result);
    } catch (e) {
      console.error('Failed to load models:', e);
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  const loadModelImages = useCallback(async (modelId: string) => {
    // Serve from cache instantly
    const cached = _imageCache.get(modelId);
    if (cached) {
      setModelImages(cached);
    } else {
      setImagesLoading(true);
    }

    try {
      const res = await fetch(`/api/models/${modelId}/images`);
      const data = await res.json();
      const images: ModelImage[] = Array.isArray(data) ? data : [];

      // Sign URLs in parallel client-side
      const signed = await Promise.all(
        images.map(async (img) => {
          if (img.signedUrl) return img;
          if (!img.gcsUrl?.includes('storage.googleapis.com')) return img;
          const url = await signImageUrl(img.gcsUrl);
          return url ? { ...img, signedUrl: url } : img;
        }),
      );

      _imageCache.set(modelId, signed);
      setModelImages(signed);
    } catch (e) {
      console.error('Failed to load model images:', e);
    } finally {
      setImagesLoading(false);
    }
  }, []);

  // Initial load (uses cache if fresh)
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // 60s baseline refresh
  useEffect(() => {
    const id = setInterval(() => loadModels(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [loadModels]);

  const refresh = useCallback(() => loadModels(true), [loadModels]);

  return { models, modelImages, setModelImages, isLoadingPage, imagesLoading, refresh, loadModelImages };
}
