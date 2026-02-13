'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import type { Job } from '@/types';
import { useStuckJobRecovery } from './useStuckJobRecovery';

const ACTIVE_POLL_INTERVAL = 1_500;  // 1.5s when jobs are running
const IDLE_POLL_INTERVAL   = 30_000; // 30s baseline
const FETCH_TIMEOUT        = 15_000; // 15s max per request
const CACHE_KEY = 'ai-ugc-jobs';

function getCachedJobs(): Job[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function setCachedJobs(jobs: Job[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(jobs)); } catch {}
}

function useJobsInternal() {
  const [jobs, setJobs] = useState<Job[]>(getCachedJobs);
  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const loadJobsRef = useRef<() => Promise<void>>(null);

  // Auto-recover stuck jobs (processing > threshold)
  const { checkAndRecover } = useStuckJobRecovery(() => {
    loadJobsRef.current?.();
  });

  const loadJobs = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Abort after timeout to prevent hanging
    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch('/api/jobs', { signal: ac.signal });
      clearTimeout(timeout);
      if (!mountedRef.current) return;
      if (!res.ok) return; // silently skip bad responses
      const data = await res.json();
      const arr: Job[] = Array.isArray(data) ? data : [];

      const snapshot = arr.map((j) => `${j.id}:${j.status}:${j.step}`).join('|');
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setJobs(arr);
        setCachedJobs(arr);
      }

      // Check for stuck jobs and trigger recovery if needed
      checkAndRecover(arr);
    } catch {
      clearTimeout(timeout);
      // Silently ignore — cached data stays visible
    }
  }, [checkAndRecover]);

  // Keep ref current for recovery callback
  loadJobsRef.current = loadJobs;

  // Adaptive polling: fast when active, slow when idle
  const scheduleNext = useCallback(() => {
    if (!mountedRef.current) return;
    setJobs((current) => {
      const hasActive = current.some(
        (j) => j.status === 'queued' || j.status === 'processing',
      );
      const delay = hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await loadJobs();
        scheduleNext();
      }, delay);

      return current;
    });
  }, [loadJobs]);

  useEffect(() => {
    mountedRef.current = true;
    loadJobs().then(scheduleNext);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadJobs, scheduleNext]);

  const forceRefresh = useCallback(async () => {
    lastSnapshotRef.current = '';
    await loadJobs();
    scheduleNext();
  }, [loadJobs, scheduleNext]);

  return { jobs, refresh: forceRefresh };
}

type JobsContextType = { jobs: Job[]; refresh: () => Promise<void> };

const JobsContext = createContext<JobsContextType | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const value = useJobsInternal();
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within a JobsProvider');
  return ctx;
}
