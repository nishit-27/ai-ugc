'use client';

import { useCallback, useRef } from 'react';

const RECOVERY_COOLDOWN = 30_000;   // Don't call recovery more than once per 30s
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Hook that provides a function to trigger stuck-job recovery.
 * Call `checkAndRecover(jobs)` with the current job list during each poll.
 * It will call the recovery endpoint if any job has been processing > 10 min.
 * Has a built-in cooldown to prevent spamming.
 */
export function useStuckJobRecovery(onRecovered?: () => void) {
  const lastRecoveryRef = useRef(0);
  const inFlightRef = useRef(false);

  const checkAndRecover = useCallback(
    (jobs: { status: string; createdAt: string }[]) => {
      // Check if any job has been processing for too long
      const now = Date.now();
      const hasStuck = jobs.some((j) => {
        if (j.status !== 'processing') return false;
        const created = new Date(j.createdAt).getTime();
        return now - created > STUCK_THRESHOLD_MS;
      });

      if (!hasStuck) return;
      if (inFlightRef.current) return;
      if (now - lastRecoveryRef.current < RECOVERY_COOLDOWN) return;

      // Trigger recovery
      inFlightRef.current = true;
      lastRecoveryRef.current = now;

      fetch('/api/recover-stuck-jobs', { method: 'POST' })
        .then((res) => res.json())
        .then((data) => {
          if (data.recovered > 0) {
            console.log(`[Recovery] Recovered ${data.recovered} stuck jobs`);
            onRecovered?.();
          }
        })
        .catch((err) => {
          console.error('[Recovery] Failed:', err);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    },
    [onRecovered],
  );

  return { checkAndRecover };
}
