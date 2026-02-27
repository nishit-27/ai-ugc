'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MusicTrack } from '@/types';

const CACHE_KEY = 'ai-ugc-music-tracks';

function loadCache(): MusicTrack[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveCache(tracks: MusicTrack[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(tracks));
  } catch {}
}

export function useMusicTracks() {
  const [tracks, setTracks] = useState<MusicTrack[]>(loadCache);
  const fetchedRef = useRef(false);

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/music-tracks');
      const data = await res.json();
      const list: MusicTrack[] = Array.isArray(data) ? data : [];
      setTracks(list);
      saveCache(list);
    } catch (e) {
      console.error('Failed to load music tracks:', e);
    }
  }, []);

  // Fetch once on first mount — subsequent mounts use cache instantly
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      const timer = setTimeout(() => {
        void loadTracks();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [loadTracks]);

  const uploadTrack = useCallback(async (file: File, name?: string): Promise<MusicTrack> => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    const res = await fetch('/api/music-tracks', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Failed to upload track');
    const track: MusicTrack = await res.json();
    // Optimistic update: add to list immediately
    setTracks((prev) => {
      const next = [track, ...prev];
      saveCache(next);
      return next;
    });
    return track;
  }, []);

  /** URLs are now R2 public — return as-is. */
  const getSignedUrl = useCallback(async (url: string): Promise<string> => {
    return url;
  }, []);

  // Add an existing GCS track to library (e.g. from trending)
  const addToLibrary = useCallback(async (name: string, gcsUrl: string, duration?: number): Promise<MusicTrack> => {
    const res = await fetch('/api/music-tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, gcsUrl, duration }),
    });
    if (!res.ok) throw new Error('Failed to add track to library');
    const track: MusicTrack = await res.json();
    setTracks((prev) => {
      const next = [track, ...prev];
      saveCache(next);
      return next;
    });
    return track;
  }, []);

  const refresh = useCallback(() => loadTracks(), [loadTracks]);

  return { tracks, refresh, uploadTrack, addToLibrary, getSignedUrl };
}
