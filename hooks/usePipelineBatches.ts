'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PipelineBatch } from '@/types';

const ACTIVE_POLL_INTERVAL = 3_000;   // 3s when batches are active
const IDLE_POLL_INTERVAL   = 30_000;  // 30s baseline
const FETCH_TIMEOUT        = 15_000;  // 15s max per request
const CACHE_KEY = 'ai-ugc-pipeline-batches';

function getCachedBatches(): PipelineBatch[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function setCachedBatches(batches: PipelineBatch[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(batches)); } catch {}
}

export function usePipelineBatches() {
  const [batches, setBatches] = useState<PipelineBatch[]>(getCachedBatches);
  const [loading, setLoading] = useState(() => getCachedBatches().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const loadBatches = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch('/api/pipeline-batches', { signal: ac.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!mountedRef.current) return;
      if (!res.ok) return;
      const data = await res.json();
      const arr: PipelineBatch[] = Array.isArray(data) ? data : [];

      const snapshot = arr
        .map((b) => `${b.id}:${b.status}:${b.completedJobs}:${b.failedJobs}`)
        .join('|');

      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setBatches(arr);
        setCachedBatches(arr);
      }
    } catch {
      clearTimeout(timeout);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (!mountedRef.current) return;
    setBatches((current) => {
      const hasActive = current.some(
        (b) => b.status === 'pending' || b.status === 'processing',
      );
      const delay = hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await loadBatches();
        scheduleNext();
      }, delay);

      return current;
    });
  }, [loadBatches]);

  useEffect(() => {
    mountedRef.current = true;
    loadBatches().then(scheduleNext);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadBatches, scheduleNext]);

  const refresh = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRefreshing(true);
    lastSnapshotRef.current = '';
    await loadBatches();
    if (mountedRef.current) setRefreshing(false);
    scheduleNext();
  }, [loadBatches, scheduleNext]);

  return { batches, loading, refresh, refreshing };
}
