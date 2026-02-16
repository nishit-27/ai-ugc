'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PipelineBatch } from '@/types';
import { usePageVisibility } from './usePageVisibility';

const ACTIVE_POLL_INTERVAL = 3_000;   // 3s when batches are active
const IDLE_POLL_INTERVAL   = 30_000;  // 30s baseline
const HIDDEN_POLL_INTERVAL = 120_000; // 2m when tab is hidden
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
  const isPageVisible = usePageVisibility();
  const [batches, setBatches] = useState<PipelineBatch[]>(getCachedBatches);
  const [loading, setLoading] = useState(() => getCachedBatches().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const wasVisibleRef = useRef(isPageVisible);

  const loadBatches = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch('/api/pipeline-batches', { signal: ac.signal, cache: 'default' });
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
      let delay = HIDDEN_POLL_INTERVAL;
      if (isPageVisible) {
        const hasActive = current.some(
          (b) => b.status === 'pending' || b.status === 'processing',
        );
        delay = hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await loadBatches();
        scheduleNext();
      }, delay);

      return current;
    });
  }, [isPageVisible, loadBatches]);

  useEffect(() => {
    mountedRef.current = true;
    loadBatches().then(scheduleNext);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadBatches, scheduleNext]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduleNext();
  }, [isPageVisible, scheduleNext]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isPageVisible;
    if (!wasVisible && isPageVisible) {
      void loadBatches();
    }
  }, [isPageVisible, loadBatches]);

  const refresh = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRefreshing(true);
    lastSnapshotRef.current = '';
    await loadBatches();
    if (mountedRef.current) setRefreshing(false);
    scheduleNext();
  }, [loadBatches, scheduleNext]);

  const masterBatches = batches.filter(b => b.isMaster);
  const regularBatches = batches.filter(b => !b.isMaster);

  return { batches, masterBatches, regularBatches, loading, refresh, refreshing };
}
