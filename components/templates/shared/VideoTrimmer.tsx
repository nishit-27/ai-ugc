'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Scissors, Eye, X } from 'lucide-react';

type TimelineFrame = { signedUrl: string; timestamp: number };

// Module-level cache: survives unmount/remount when switching steps
const _frameCache = new Map<string, TimelineFrame[]>();

type Props = {
  videoUrl: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export default function VideoTrimmer({ videoUrl, duration, trimStart, trimEnd, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frames, setFrames] = useState<TimelineFrame[]>(() => _frameCache.get(videoUrl) ?? []);
  const [loading, setLoading] = useState(() => !_frameCache.has(videoUrl));
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Fetch timeline frames once per videoUrl (skip if cached)
  useEffect(() => {
    const cached = _frameCache.get(videoUrl);
    if (cached) {
      setFrames(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFrames([]);
    fetch('/api/extract-timeline-frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.frames) {
          _frameCache.set(videoUrl, data.frames);
          setFrames(data.frames);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [videoUrl]);

  // Clamp preview playback to trimmed range
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !previewing) return;
    const onTimeUpdate = () => {
      if (v.currentTime >= trimEnd) {
        v.pause();
        v.currentTime = trimStart;
        setPlaying(false);
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [trimStart, trimEnd, previewing]);

  // Seek to trimStart when opening preview
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !previewing) return;
    v.currentTime = trimStart;
    v.play().then(() => setPlaying(true)).catch(() => {});
  }, [previewing, trimStart]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) {
        v.currentTime = trimStart;
      }
      v.play();
      setPlaying(true);
    }
  };

  const closePreview = () => {
    const v = videoRef.current;
    if (v) { v.pause(); }
    setPlaying(false);
    setPreviewing(false);
  };

  const getTimeFromPointer = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const onPointerDown = useCallback((handle: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const t = getTimeFromPointer(e.clientX);
    const minClip = 0.5;
    if (dragging === 'start') {
      const clamped = Math.max(0, Math.min(t, trimEnd - minClip));
      onChange(clamped, trimEnd);
    } else {
      const clamped = Math.min(duration, Math.max(t, trimStart + minClip));
      onChange(trimStart, clamped);
    }
  }, [dragging, duration, trimStart, trimEnd, onChange, getTimeFromPointer]);

  const onPointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const startPct = (trimStart / duration) * 100;
  const endPct = (trimEnd / duration) * 100;
  const clipDuration = trimEnd - trimStart;
  const isFullRange = trimStart === 0 && Math.abs(trimEnd - duration) < 0.1;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--accent)] p-3 space-y-2">
      {/* Header row 1: label + preview */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Scissors className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-muted)]">Trim</span>
        </div>
        <button
          onClick={() => setPreviewing(!previewing)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--background)] transition-colors"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
      </div>
      {/* Header row 2: time range + duration */}
      <div className="flex items-center justify-between text-[11px] tabular-nums">
        <span className="text-[var(--text-muted)]">
          {formatTime(trimStart)} – {formatTime(trimEnd)}
        </span>
        <span className={`rounded-md px-1.5 py-0.5 font-medium ${
          isFullRange
            ? 'bg-[var(--background)] text-[var(--text-muted)]'
            : 'bg-[var(--primary)] text-[var(--primary-foreground)]'
        }`}>
          {clipDuration.toFixed(1)}s
        </span>
      </div>

      {/* Video preview (trimmed range only) */}
      {previewing && (
        <div className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full max-h-48 object-contain"
            playsInline
            preload="metadata"
          />
          {/* Play/pause overlay */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center transition-opacity"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-opacity ${playing ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </div>
          </button>
          {/* Close button */}
          <button
            onClick={closePreview}
            className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Timeline strip */}
      <div
        ref={trackRef}
        className="relative h-10 rounded-lg overflow-hidden bg-black/30 select-none touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Thumbnail row */}
        {loading ? (
          <div className="flex h-full gap-px px-px">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="h-full flex-1 animate-pulse rounded-sm"
                style={{
                  backgroundColor: 'var(--border)',
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full">
            {frames.map((f, i) => (
              <img
                key={i}
                src={f.signedUrl}
                alt=""
                className="h-full flex-1 object-cover"
                draggable={false}
              />
            ))}
          </div>
        )}

        {/* Dim left region */}
        <div
          className="absolute inset-y-0 left-0 bg-black/60 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
          style={{ width: `${startPct}%` }}
        />

        {/* Dim right region */}
        <div
          className="absolute inset-y-0 right-0 bg-black/60 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Selected region top/bottom border */}
        <div
          className="absolute inset-y-0 pointer-events-none border-y-[2px] border-[var(--primary)]"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Start handle */}
        <div
          className="absolute inset-y-0 z-10 flex items-center cursor-ew-resize"
          style={{ left: `${startPct}%`, width: '14px', marginLeft: '-7px' }}
          onPointerDown={(e) => onPointerDown('start', e)}
        >
          <div className={`
            mx-auto h-full w-[5px] rounded-l-sm
            bg-[var(--primary)] shadow-[2px_0_6px_rgba(0,0,0,0.3)]
            flex items-center justify-center
            transition-all duration-100
            ${dragging === 'start' ? 'w-[7px] bg-white' : 'hover:w-[7px] hover:bg-white'}
          `}>
            <div className="flex flex-col gap-[2px]">
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
            </div>
          </div>
        </div>

        {/* End handle */}
        <div
          className="absolute inset-y-0 z-10 flex items-center cursor-ew-resize"
          style={{ left: `${endPct}%`, width: '14px', marginLeft: '-7px' }}
          onPointerDown={(e) => onPointerDown('end', e)}
        >
          <div className={`
            mx-auto h-full w-[5px] rounded-r-sm
            bg-[var(--primary)] shadow-[-2px_0_6px_rgba(0,0,0,0.3)]
            flex items-center justify-center
            transition-all duration-100
            ${dragging === 'end' ? 'w-[7px] bg-white' : 'hover:w-[7px] hover:bg-white'}
          `}>
            <div className="flex flex-col gap-[2px]">
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
              <div className="w-[1px] h-[3px] rounded-full bg-black/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
