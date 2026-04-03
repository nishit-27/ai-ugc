'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Scissors } from 'lucide-react';
import type { MasterModel } from './NodeConfigPanel';
import VideoTrimmer from './shared/VideoTrimmer';

const DURATION_MATCH_TOLERANCE_SECONDS = 0.25;
const MIN_CLIP_SECONDS = 0.5;

const durationValueCache = new Map<string, number>();
const durationPromiseCache = new Map<string, Promise<number>>();

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function loadVideoDuration(url: string): Promise<number> {
  const cached = durationValueCache.get(url);
  if (cached !== undefined) {
    return cached;
  }

  const pending = durationPromiseCache.get(url);
  if (pending) {
    return pending;
  }

  const promise = fetch('/api/video-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
    .then((res) => res.json())
    .then((data) => {
      const duration = roundTime(Number(data?.duration) || 0);
      durationValueCache.set(url, duration);
      durationPromiseCache.delete(url);
      return duration;
    })
    .catch(() => {
      durationPromiseCache.delete(url);
      return 0;
    });

  durationPromiseCache.set(url, promise);
  return promise;
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1)}s`;
}

type Props = {
  masterModels: MasterModel[];
  selectedModelIds: string[];
  libraryVideos: Record<string, string>;
  trimStart?: number;
  trimEnd?: number;
  onTrimChange?: (start?: number, end?: number) => void;
};

export default function LibraryVideoTrimPanel({
  masterModels,
  selectedModelIds,
  libraryVideos,
  trimStart,
  trimEnd,
  onTrimChange,
}: Props) {
  const [durationsByUrl, setDurationsByUrl] = useState<Record<string, number>>({});
  const [loadingUrls, setLoadingUrls] = useState<Record<string, true>>({});

  const selectedEntries = useMemo(() => selectedModelIds.map((modelId) => ({
    modelId,
    modelName: masterModels.find((model) => model.modelId === modelId)?.modelName || modelId,
    url: libraryVideos[modelId],
  })), [libraryVideos, masterModels, selectedModelIds]);

  useEffect(() => {
    let cancelled = false;
    const urlsToLoad = Array.from(new Set(
      selectedEntries
        .map((entry) => entry.url)
        .filter((url): url is string => !!url)
        .filter((url) => durationsByUrl[url] === undefined),
    ));

    if (urlsToLoad.length === 0) {
      return;
    }

    setLoadingUrls((prev) => {
      const next = { ...prev };
      for (const url of urlsToLoad) {
        next[url] = true;
      }
      return next;
    });

    Promise.all(urlsToLoad.map(async (url) => {
      const duration = await loadVideoDuration(url);
      return { url, duration };
    })).then((results) => {
      if (cancelled) {
        return;
      }
      setDurationsByUrl((prev) => {
        const next = { ...prev };
        for (const result of results) {
          next[result.url] = result.duration;
        }
        return next;
      });
      setLoadingUrls((prev) => {
        const next = { ...prev };
        for (const result of results) {
          delete next[result.url];
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [durationsByUrl, selectedEntries]);

  const allSelectedHaveVideos = selectedEntries.length > 0 && selectedEntries.every((entry) => !!entry.url);
  const selectedDurations = selectedEntries
    .filter((entry) => !!entry.url)
    .map((entry) => durationsByUrl[entry.url!])
    .filter((duration): duration is number => typeof duration === 'number' && duration > 0);
  const isLoadingDurations = selectedEntries
    .filter((entry) => !!entry.url)
    .some((entry) => !!loadingUrls[entry.url!]);

  const minDuration = selectedDurations.length > 0 ? Math.min(...selectedDurations) : 0;
  const maxDuration = selectedDurations.length > 0 ? Math.max(...selectedDurations) : 0;
  const hasMatchingDurations =
    allSelectedHaveVideos &&
    selectedDurations.length === selectedEntries.length &&
    (maxDuration - minDuration) <= DURATION_MATCH_TOLERANCE_SECONDS;
  const commonDuration = hasMatchingDurations ? roundTime(minDuration) : undefined;

  useEffect(() => {
    if (!onTrimChange) {
      return;
    }

    if (!commonDuration) {
      if (trimStart !== undefined || trimEnd !== undefined) {
        onTrimChange(undefined, undefined);
      }
      return;
    }

    const nextStart = roundTime(Math.max(0, Math.min(trimStart ?? 0, Math.max(0, commonDuration - MIN_CLIP_SECONDS))));
    const nextEnd = roundTime(Math.min(commonDuration, Math.max(trimEnd ?? commonDuration, nextStart + MIN_CLIP_SECONDS)));

    if (trimStart !== nextStart || trimEnd !== nextEnd) {
      onTrimChange(nextStart, nextEnd);
    }
  }, [commonDuration, onTrimChange, trimEnd, trimStart]);

  if (selectedModelIds.length === 0) {
    return null;
  }

  const previewVideoUrl = selectedEntries.find((entry) => !!entry.url)?.url;

  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]">
          <Scissors className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text)]">Library Source Trim</p>
          <p className="text-[10px] text-[var(--text-muted)]">Applies the same trim to every selected model video.</p>
        </div>
      </div>

      {!allSelectedHaveVideos ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          Pick a library video for every selected model to enable trimming.
        </div>
      ) : isLoadingDurations ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
          Checking video lengths...
        </div>
      ) : !commonDuration || !previewVideoUrl ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p>Trim is only available when all selected library videos have the same length.</p>
              {selectedDurations.length > 0 && (
                <p className="flex items-center gap-1 text-[10px] font-medium">
                  <Clock className="h-3 w-3" />
                  Current durations range from {formatDuration(minDuration)} to {formatDuration(maxDuration)}.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <VideoTrimmer
            videoUrl={previewVideoUrl}
            duration={commonDuration}
            trimStart={trimStart ?? 0}
            trimEnd={trimEnd ?? commonDuration}
            onChange={(start, end) => onTrimChange?.(roundTime(start), roundTime(end))}
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            All selected library videos are treated as {formatDuration(commonDuration)} clips, so this same range is used for every model.
          </p>
        </>
      )}
    </div>
  );
}
