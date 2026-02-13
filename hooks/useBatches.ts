'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Batch } from '@/types';
import { useStuckJobRecovery } from './useStuckJobRecovery';

const REFRESH_INTERVAL = 60_000;
const ACTIVE_POLL_INTERVAL = 3_000;

// Module-level cache
let _cache: Batch[] = [];
let _cacheTime = 0;

export function useBatches() {
  const [batches, setBatches] = useState<Batch[]>(_cache);
  const [isLoadingPage, setIsLoadingPage] = useState(_cache.length === 0);
  const activePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-recover stuck jobs (processing > 10 min)
  const { checkAndRecover } = useStuckJobRecovery(() => {
    loadBatches(true);
  });

  const loadBatches = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < REFRESH_INTERVAL) {
      setBatches(_cache);
      setIsLoadingPage(false);
      return;
    }
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      const result = Array.isArray(data) ? data : [];
      _cache = result;
      _cacheTime = Date.now();
      setBatches(result);

      // Check for stuck processing batches and trigger recovery
      checkAndRecover(
        result
          .filter((b: Batch) => b.status === 'processing' && b.createdAt)
          .map((b: Batch) => ({ status: b.status, createdAt: b.createdAt! }))
      );
    } catch (e) {
      console.error('Failed to load batches:', e);
    } finally {
      setIsLoadingPage(false);
    }
  }, [checkAndRecover]);

  // Initial load (uses cache if fresh)
  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // 60s baseline refresh
  useEffect(() => {
    const id = setInterval(() => loadBatches(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [loadBatches]);

  // Fast poll when batches are active
  useEffect(() => {
    const hasActive = batches.some((b) => b.status === 'pending' || b.status === 'processing');
    if (hasActive && !activePollRef.current) {
      activePollRef.current = setInterval(() => loadBatches(true), ACTIVE_POLL_INTERVAL);
    } else if (!hasActive && activePollRef.current) {
      clearInterval(activePollRef.current);
      activePollRef.current = null;
    }
    return () => {
      if (activePollRef.current) {
        clearInterval(activePollRef.current);
        activePollRef.current = null;
      }
    };
  }, [batches, loadBatches]);

  const refresh = useCallback(() => loadBatches(true), [loadBatches]);

  return { batches, isLoadingPage, refresh };
}
