'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type UseTimelinePlayheadOptions = {
  isPlaying: boolean;
  getVideoElements: () => Map<string, HTMLVideoElement>;
  seekGlobal: (timeSec: number) => void;
};

export function useTimelinePlayhead({
  isPlaying,
  getVideoElements,
  seekGlobal,
}: UseTimelinePlayheadOptions) {
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);

  // Sync playhead to the first video element's currentTime during playback
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const elements = getVideoElements();
      if (elements.size > 0) {
        const firstVideo = elements.values().next().value;
        if (firstVideo && isFinite(firstVideo.currentTime)) {
          setCurrentTime(firstVideo.currentTime);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, getVideoElements]);

  const seek = useCallback(
    (timeSec: number) => {
      setCurrentTime(timeSec);
      seekGlobal(timeSec);
    },
    [seekGlobal],
  );

  return { currentTime, seek };
}
