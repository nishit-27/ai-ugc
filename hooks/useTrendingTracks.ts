'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TrendingTrack } from '@/types';

const CACHE_KEY = 'ai-ugc-trending-tracks';

function loadCache(): { tracks: TrendingTrack[]; stale: boolean } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Handle old cache format (plain array) from previous hook version
      if (Array.isArray(parsed)) return { tracks: parsed, stale: true };
      return { tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [], stale: parsed.stale ?? true };
    }
  } catch {}
  return { tracks: [], stale: true };
}

function saveCache(tracks: TrendingTrack[], stale: boolean) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tracks, stale }));
  } catch {}
}

export function useTrendingTracks() {
  const cached = loadCache();
  const [tracks, setTracks] = useState<TrendingTrack[]>(cached.tracks);
  const [stale, setStale] = useState(cached.stale);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  // Load tracks from DB (fast, no API call)
  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trending-tracks');
      const data = await res.json();
      const list: TrendingTrack[] = data.tracks ?? [];
      const isStale: boolean = data.stale ?? true;
      setTracks(list);
      setStale(isStale);
      saveCache(list, isStale);
    } catch (e) {
      console.error('Failed to load trending tracks:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      void loadTracks();
    }
  }, [loadTracks]);

  // Full refresh: fetch from RapidAPI + download all to GCS + replace DB
  const refreshTracks = useCallback(async () => {
    setRefreshing(true);
    // Clear stale data immediately so UI shows loading state
    setTracks([]);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
    try {
      const res = await fetch('/api/trending-tracks', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Refresh error:', res.status, err);
        // Reload whatever is in DB after failed refresh
        await loadTracks();
        return;
      }
      const data = await res.json();
      const list: TrendingTrack[] = data.tracks ?? [];
      setTracks(list);
      setStale(false);
      saveCache(list, false);
    } catch (e) {
      console.error('Failed to refresh trending tracks:', e);
      await loadTracks();
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { tracks, stale, loading, refreshing, refreshTracks };
}
