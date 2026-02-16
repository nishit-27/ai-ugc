'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signUrls } from '@/lib/signedUrlClient';
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
      const res = await fetch('/api/models');
      const data = await res.json();
      const result: Model[] = Array.isArray(data) ? data : [];

      // Show data immediately
      _cache = result;
      _cacheTime = Date.now();
      setModels(result);
      setIsLoadingPage(false);

      // Batch-sign avatar URLs client-side
      const avatarUrls = result
        .filter((m) => !m.avatarUrl?.includes('X-Goog-Signature='))
        .map((m) => m.avatarUrl)
        .filter((url): url is string => !!url && url.includes('storage.googleapis.com'));

      if (avatarUrls.length > 0) {
        const signed = await signUrls(avatarUrls);
        const withSigned = result.map((m) => ({
          ...m,
          avatarUrl: m.avatarUrl ? (signed.get(m.avatarUrl) || m.avatarUrl) : m.avatarUrl,
        }));
        _cache = withSigned;
        setModels(withSigned);
      }
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

      // Show images immediately, then sign in batch
      setModelImages(images);

      const gcsUrls = images
        .filter((img) => !img.signedUrl)
        .map((img) => img.gcsUrl)
        .filter((url) => url?.includes('storage.googleapis.com'));

      if (gcsUrls.length > 0) {
        const signed = await signUrls(gcsUrls);
        const withSigned = images.map((img) => ({
          ...img,
          signedUrl: signed.get(img.gcsUrl) || img.gcsUrl,
        }));
        _imageCache.set(modelId, withSigned);
        setModelImages(withSigned);
      } else {
        _imageCache.set(modelId, images);
      }
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
