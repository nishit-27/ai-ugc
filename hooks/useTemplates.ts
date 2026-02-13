'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TemplateJob } from '@/types';
import { useStuckJobRecovery } from './useStuckJobRecovery';

const ACTIVE_POLL_INTERVAL = 1_500;  // 1.5s when jobs are running
const IDLE_POLL_INTERVAL   = 30_000; // 30s baseline
const FETCH_TIMEOUT        = 15_000; // 15s max per request
const CACHE_KEY = 'ai-ugc-template-jobs';

function getCachedJobs(): TemplateJob[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Inject freshly-created job from sessionStorage so it shows instantly
        try {
          const newJobRaw = sessionStorage.getItem('ai-ugc-new-job');
          if (newJobRaw) {
            const newJob = JSON.parse(newJobRaw) as TemplateJob;
            if (!parsed.some((j: TemplateJob) => j.id === newJob.id)) {
              return [newJob, ...parsed];
            }
          }
        } catch {}
        return parsed;
      }
    }
  } catch {}
  // Even if no cache, check for new job
  try {
    const newJobRaw = sessionStorage.getItem('ai-ugc-new-job');
    if (newJobRaw) return [JSON.parse(newJobRaw)];
  } catch {}
  return [];
}

function setCachedJobs(jobs: TemplateJob[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(jobs)); } catch {}
}

export function useTemplates() {
  const [jobs, setJobs] = useState<TemplateJob[]>(getCachedJobs);
  const [loading, setLoading] = useState(() => getCachedJobs().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const lastSnapshotRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const loadJobsRef = useRef<() => Promise<void>>(null);

  // Auto-recover stuck jobs (processing > 10 min)
  const { checkAndRecover } = useStuckJobRecovery(() => {
    // After recovery, force refresh to pick up updated statuses
    loadJobsRef.current?.();
  });

  const loadJobs = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Abort after timeout to prevent hanging
    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch('/api/templates', { signal: ac.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!mountedRef.current) return;
      if (!res.ok) return; // silently skip bad responses
      const data = await res.json();
      const arr: TemplateJob[] = Array.isArray(data) ? data : [];

      const snapshot = arr
        .map((j) => `${j.id}:${j.status}:${j.step}:${j.currentStep}:${j.signedUrl || ''}`)
        .join('|');

      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setJobs(arr);
        setCachedJobs(arr);
        // Clear injected new-job once it appears in real data
        try {
          const njRaw = sessionStorage.getItem('ai-ugc-new-job');
          if (njRaw) {
            const nj = JSON.parse(njRaw);
            if (arr.some((j) => j.id === nj.id)) {
              sessionStorage.removeItem('ai-ugc-new-job');
            }
          }
        } catch {}
      }

      // Check for stuck jobs and trigger recovery if needed
      checkAndRecover(arr);
    } catch {
      clearTimeout(timeout);
      // Silently ignore — cached data stays visible
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [checkAndRecover]);

  // Keep ref current for recovery callback
  loadJobsRef.current = loadJobs;

  // Adaptive polling: fast when active, slow when idle, stops when unmounted
  const scheduleNext = useCallback(() => {
    if (!mountedRef.current) return;
    // Read current jobs from ref-stable state via functional update trick
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

      return current; // no state change
    });
  }, [loadJobs]);

  // Mount: load immediately, start adaptive loop
  useEffect(() => {
    mountedRef.current = true;
    loadJobs().then(scheduleNext);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadJobs, scheduleNext]);

  const refresh = useCallback(async () => {
    // Cancel any pending poll so it can't abort our refresh fetch
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRefreshing(true);
    lastSnapshotRef.current = '';
    await loadJobs();
    if (mountedRef.current) setRefreshing(false);
    scheduleNext(); // re-kick adaptive timer after manual refresh
  }, [loadJobs, scheduleNext]);

  return { jobs, loading, refresh, refreshing };
}
