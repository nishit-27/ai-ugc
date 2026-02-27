'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Model, ModelImage } from '@/types';
import { usePageVisibility } from './usePageVisibility';

const REFRESH_INTERVAL = 60_000;

// Module-level caches
let _cache: Model[] = [];
let _cacheTime = 0;
const _imageCache = new Map<string, ModelImage[]>();

export function useModels() {
  const isPageVisible = usePageVisibility();
  const [models, setModels] = useState<Model[]>(_cache);
  const [modelImages, setModelImages] = useState<ModelImage[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(_cache.length === 0);
  const [imagesLoading, setImagesLoading] = useState(false);
  const wasVisibleRef = useRef(isPageVisible);

  const loadModels = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < REFRESH_INTERVAL) {
      setModels(_cache);
      setIsLoadingPage(false);
      return;
    }
    try {
      const res = await fetch('/api/models', { cache: 'no-store' });
      const data = await res.json();
      const result: Model[] = Array.isArray(data) ? data : [];

      _cache = result;
      _cacheTime = Date.now();
      setModels(result);
      setIsLoadingPage(false);
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

      // Ensure all images have a displayable URL
      const withUrls = images.map((img) => ({
        ...img,
        signedUrl: img.signedUrl || img.gcsUrl,
      }));
      _imageCache.set(modelId, withUrls);
      setModelImages(withUrls);
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
    if (!isPageVisible) return;
    const id = setInterval(() => loadModels(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [isPageVisible, loadModels]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isPageVisible;
    if (!wasVisible && isPageVisible) {
      void loadModels(true);
    }
  }, [isPageVisible, loadModels]);

  const refresh = useCallback(() => loadModels(true), [loadModels]);

  return { models, modelImages, setModelImages, isLoadingPage, imagesLoading, refresh, loadModelImages };
}
