'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import type { Job } from '@/types';
import { signUrls, getSignedUrl } from '@/lib/signedUrlClient';
import { useStuckJobRecovery } from './useStuckJobRecovery';
import { usePageVisibility } from './usePageVisibility';

const ACTIVE_POLL_INTERVAL = 1_500;  // 1.5s when jobs are running
const IDLE_POLL_INTERVAL   = 30_000; // 30s baseline
const HIDDEN_POLL_INTERVAL = 120_000; // 2m when tab is hidden
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
  const isPageVisible = usePageVisibility();
  const [jobs, setJobs] = useState<Job[]>(getCachedJobs);
  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const loadJobsRef = useRef<() => Promise<void>>(null);
  const scheduleNextRef = useRef<() => void>(() => {});
  const wasVisibleRef = useRef(isPageVisible);

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

      // Attach cached signed URLs to completed jobs immediately
      const withSigned = arr.map((j) => {
        if (j.status === 'completed' && j.outputUrl) {
          const cached = getSignedUrl(j.outputUrl);
          if (cached !== j.outputUrl) return { ...j, signedUrl: cached };
        }
        return j;
      });

      const snapshot = withSigned.map((j) => `${j.id}:${j.status}:${j.step}`).join('|');
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setJobs(withSigned);
        setCachedJobs(withSigned);
      }

      // Sign any new completed URLs in background (non-blocking)
      const unsignedUrls = withSigned
        .filter((j) => j.status === 'completed' && j.outputUrl && !j.signedUrl && j.outputUrl.includes('storage.googleapis.com'))
        .map((j) => j.outputUrl!);

      if (unsignedUrls.length > 0) {
        signUrls(unsignedUrls).then((signed) => {
          if (!mountedRef.current) return;
          setJobs((prev) => prev.map((j) => {
            if (j.outputUrl && signed.has(j.outputUrl)) {
              return { ...j, signedUrl: signed.get(j.outputUrl) };
            }
            return j;
          }));
        });
      }

      // Check for stuck jobs and trigger recovery if needed
      checkAndRecover(arr);
    } catch {
      clearTimeout(timeout);
      // Silently ignore — cached data stays visible
    }
  }, [checkAndRecover]);

  // Keep ref current for recovery callback
  useEffect(() => {
    loadJobsRef.current = loadJobs;
  }, [loadJobs]);

  // Adaptive polling: fast when active, slow when idle
  const scheduleNext = useCallback(() => {
    if (!mountedRef.current) return;
    setJobs((current) => {
      let delay = HIDDEN_POLL_INTERVAL;
      if (isPageVisible) {
        const hasActive = current.some(
          (j) => j.status === 'queued' || j.status === 'processing',
        );
        delay = hasActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await loadJobs();
        scheduleNextRef.current();
      }, delay);

      return current;
    });
  }, [isPageVisible, loadJobs]);

  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    const kickoff = setTimeout(() => {
      void loadJobs().then(scheduleNext);
    }, 0);

    return () => {
      clearTimeout(kickoff);
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadJobs, scheduleNext]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduleNext();
  }, [isPageVisible, scheduleNext]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isPageVisible;
    if (!wasVisible && isPageVisible) {
      const refreshOnReturn = setTimeout(() => {
        void loadJobs();
      }, 0);
      return () => clearTimeout(refreshOnReturn);
    }
  }, [isPageVisible, loadJobs]);

  const forceRefresh = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
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
