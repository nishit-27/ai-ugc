'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  Film, ImageIcon, Play, Pause, Scissors, Copy, Trash2,
  Eye, EyeOff, Volume2, VolumeX, ZoomIn, ZoomOut,
  SkipBack, SkipForward, Maximize,
} from 'lucide-react';
import type { ComposeLayer } from '@/types';

/* ── Frame cache for timeline thumbnails ─────────────────── */
type TimelineFrame = { signedUrl: string; timestamp: number };
const _frameCache = new Map<string, TimelineFrame[]>();

/* ── Constants ───────────────────────────────────────────── */
const DEFAULT_PPS = 80;
const TRACK_HEIGHT = 52;
const RULER_HEIGHT = 28;
const LABEL_WIDTH = 150;

/* ── Types ───────────────────────────────────────────────── */
type ComposeTimelineProps = {
  layers: ComposeLayer[];
  videoDurations: Map<string, number>;
  selectedLayerId: string | null;
  hiddenLayerIds: Set<string>;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (timeSec: number) => void;
  onSelectLayer: (layerId: string) => void;
  onUpdateTrim: (layerId: string, trimStart: number, trimEnd: number) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleAudio?: (layerId: string) => void;
  onPlayPause: () => void;
};

/* ── Helpers ─────────────────────────────────────────────── */
function formatTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 30); // 30fps
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

function formatTimeShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const LAYER_COLORS = [
  'rgb(124, 58, 237)',  // violet
  'rgb(59, 130, 246)',  // blue
  'rgb(16, 185, 129)',  // emerald
  'rgb(245, 158, 11)',  // amber
  'rgb(239, 68, 68)',   // red
  'rgb(236, 72, 153)',  // pink
  'rgb(20, 184, 166)',  // teal
  'rgb(99, 102, 241)',  // indigo
];

/* ── Track Clip Frames (thumbnail strip) ─────────────────── */
function TrackClipFrames({ videoUrl, clipWidth }: { videoUrl: string; clipWidth: number }) {
  const [frames, setFrames] = useState<TimelineFrame[]>(() => _frameCache.get(videoUrl) ?? []);
  const [loading, setLoading] = useState(() => !_frameCache.has(videoUrl));

  useEffect(() => {
    if (_frameCache.has(videoUrl)) {
      setFrames(_frameCache.get(videoUrl)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [videoUrl]);

  if (loading || frames.length === 0) return null;

  // Repeat frames to fill clip width
  const thumbWidth = 40;
  const count = Math.max(1, Math.ceil(clipWidth / thumbWidth));

  return (
    <div className="absolute inset-0 flex overflow-hidden opacity-40">
      {Array.from({ length: count }).map((_, i) => {
        const frame = frames[Math.floor((i / count) * frames.length)];
        return frame ? (
          <img
            key={i}
            src={frame.signedUrl}
            alt=""
            className="h-full shrink-0 object-cover"
            style={{ width: thumbWidth }}
            draggable={false}
          />
        ) : null;
      })}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function ComposeTimeline({
  layers,
  videoDurations,
  selectedLayerId,
  hiddenLayerIds,
  currentTime,
  isPlaying,
  onSeek,
  onSelectLayer,
  onUpdateTrim,
  onRemoveLayer,
  onDuplicateLayer,
  onToggleVisibility,
  onToggleAudio,
  onPlayPause,
}: ComposeTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ type: 'playhead' | 'trim-start' | 'trim-end'; layerId?: string } | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1); // 0.25 - 4x

  const pps = DEFAULT_PPS * timelineZoom; // pixels per second

  /* ── Computed ──────────────────────────────────────────── */
  const totalDuration = useMemo(() => {
    let max = 5;
    layers.forEach((layer) => {
      if (layer.type === 'video') {
        const dur = videoDurations.get(layer.id) ?? 10;
        const trimEnd = layer.trim?.endSec ?? dur;
        if (trimEnd > max) max = trimEnd;
      }
    });
    return max + 2; // add 2s padding
  }, [layers, videoDurations]);

  const timelineWidth = totalDuration * pps;

  /* ── Ruler ticks ──────────────────────────────────────── */
  const ticks = useMemo(() => {
    const result: { x: number; label: string | null; major: boolean }[] = [];
    let step = 0.5;
    if (timelineZoom >= 2) step = 0.25;
    if (timelineZoom >= 3) step = 0.1;
    if (timelineZoom <= 0.5) step = 1;
    if (timelineZoom <= 0.25) step = 2;

    for (let t = 0; t <= totalDuration; t += step) {
      const isWhole = Math.abs(t - Math.round(t)) < 0.01;
      result.push({
        x: t * pps,
        label: isWhole ? formatTimeShort(t) : null,
        major: isWhole,
      });
    }
    return result;
  }, [totalDuration, pps, timelineZoom]);

  /* ── Pointer helpers ──────────────────────────────────── */
  const timeFromX = useCallback(
    (clientX: number) => {
      const scroll = scrollRef.current;
      if (!scroll) return 0;
      const rect = scroll.getBoundingClientRect();
      const x = clientX - rect.left + scroll.scrollLeft - LABEL_WIDTH;
      return Math.max(0, Math.min(totalDuration, x / pps));
    },
    [totalDuration, pps],
  );

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => { onSeek(timeFromX(e.clientX)); },
    [onSeek, timeFromX],
  );

  /* ── Playhead drag ────────────────────────────────────── */
  const handlePlayheadPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = { type: 'playhead' };
      const el = e.currentTarget;
      const onMove = (ev: Event) => {
        if (draggingRef.current?.type !== 'playhead') return;
        onSeek(timeFromX((ev as PointerEvent).clientX));
      };
      const onUp = () => {
        draggingRef.current = null;
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [onSeek, timeFromX],
  );

  /* ── Trim handle drag ─────────────────────────────────── */
  const handleTrimPointerDown = useCallback(
    (e: React.PointerEvent, layerId: string, edge: 'start' | 'end') => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = { type: edge === 'start' ? 'trim-start' : 'trim-end', layerId };
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      const dur = videoDurations.get(layerId) ?? 10;
      const el = e.currentTarget;
      const onMove = (ev: Event) => {
        if (!draggingRef.current || draggingRef.current.layerId !== layerId) return;
        const t = timeFromX((ev as PointerEvent).clientX);
        const currentTrimStart = layer.trim?.startSec ?? 0;
        const currentTrimEnd = layer.trim?.endSec ?? dur;
        if (draggingRef.current.type === 'trim-start') {
          const newStart = Math.max(0, Math.min(t, currentTrimEnd - 0.1));
          onUpdateTrim(layerId, newStart, currentTrimEnd);
        } else {
          const newEnd = Math.max(currentTrimStart + 0.1, Math.min(t, dur));
          onUpdateTrim(layerId, currentTrimStart, newEnd);
        }
      };
      const onUp = () => {
        draggingRef.current = null;
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [layers, videoDurations, onUpdateTrim, timeFromX],
  );

  const playheadX = currentTime * pps;

  /* ── Seek shortcuts ───────────────────────────────────── */
  const seekStart = useCallback(() => onSeek(0), [onSeek]);
  const seekEnd = useCallback(() => onSeek(totalDuration - 2), [onSeek, totalDuration]);

  /* ── Zoom helpers ─────────────────────────────────────── */
  const zoomIn = useCallback(() => setTimelineZoom((z) => Math.min(4, z * 1.5)), []);
  const zoomOut = useCallback(() => setTimelineZoom((z) => Math.max(0.25, z / 1.5)), []);
  const zoomFit = useCallback(() => {
    if (!scrollRef.current) return;
    const availableWidth = scrollRef.current.clientWidth - LABEL_WIDTH - 40;
    const fitZoom = availableWidth / (totalDuration * DEFAULT_PPS);
    setTimelineZoom(Math.max(0.25, Math.min(4, fitZoom)));
  }, [totalDuration]);

  /* ── Empty state ──────────────────────────────────────── */
  if (layers.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[var(--background)] border-t border-[var(--border)]">
        {/* Playback bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
          <div className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            {formatTimecode(0)} <span className="mx-1 text-[var(--text-muted)] opacity-50">/</span> {formatTimecode(0)}
          </div>
          <button
            onClick={onPlayPause}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] text-[var(--text-muted)]"
          >
            <Play className="h-3.5 w-3.5 ml-0.5" />
          </button>
          <div className="w-24" />
        </div>
        {/* Empty hint */}
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-sm font-medium text-[var(--text-muted)] opacity-60">No tracks yet</div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)] opacity-40">Add media to see the timeline</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--background)] border-t border-[var(--border)]">
      {/* ── Playback Controls Bar ──────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-1.5">
        {/* Time display */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tabular-nums text-[var(--primary)]">
            {formatTimecode(currentTime)}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] opacity-50">/</span>
          <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
            {formatTimecode(totalDuration - 2)}
          </span>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={seekStart}
            title="Go to start"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onPlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] text-[var(--text)] transition-colors hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            onClick={seekEnd}
            title="Go to end"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Spacer */}
        <div className="w-32" />
      </div>

      {/* ── Timeline Toolbar ───────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)] px-3 py-1">
        {/* Left tools */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              if (!selectedLayerId) return;
              const layer = layers.find((l) => l.id === selectedLayerId);
              if (!layer || layer.type !== 'video') return;
              const dur = videoDurations.get(layer.id) ?? 10;
              const trimStart = layer.trim?.startSec ?? 0;
              const trimEnd = layer.trim?.endSec ?? dur;
              // Only trim if playhead is within the clip range
              if (currentTime <= trimStart || currentTime >= trimEnd) return;
              // Trim: set new start to playhead position (remove everything before playhead)
              onUpdateTrim(layer.id, currentTime, trimEnd);
            }}
            disabled={!selectedLayerId || !layers.find((l) => l.id === selectedLayerId && l.type === 'video')}
            title="Trim start to playhead"
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              selectedLayerId && layers.find((l) => l.id === selectedLayerId && l.type === 'video')
                ? 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
            }`}
          >
            <Scissors className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => selectedLayerId && onDuplicateLayer(selectedLayerId)}
            disabled={!selectedLayerId}
            title="Duplicate layer"
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              selectedLayerId
                ? 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => selectedLayerId && onRemoveLayer(selectedLayerId)}
            title="Delete selected (Del)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <div className="mx-2 h-4 w-px bg-[var(--border)]" />

          <span className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)]">
            {layers.length} track{layers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Right — zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomFit}
            title="Fit to view"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <Maximize className="h-3 w-3" />
          </button>
          <button
            onClick={zoomOut}
            title="Zoom out"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--primary)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary)]"
          />
          <button
            onClick={zoomIn}
            title="Zoom in"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <span className="ml-1 min-w-[2.5rem] text-right text-[10px] tabular-nums text-[var(--text-muted)] opacity-60">
            {Math.round(timelineZoom * 100)}%
          </span>
        </div>
      </div>

      {/* ── Scrollable Track Area ──────────────────────── */}
      <div ref={scrollRef} className="flex flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        {/* ── Track Labels (sticky left) ─────────────── */}
        <div
          className="sticky left-0 z-10 flex flex-col shrink-0 bg-[var(--muted)] border-r border-[var(--border)]"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Ruler spacer */}
          <div
            className="flex items-end justify-between border-b border-[var(--border)] px-3 pb-1"
            style={{ height: RULER_HEIGHT }}
          >
            <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)] opacity-50">Tracks</span>
          </div>

          {/* Track labels */}
          {layers.map((layer, i) => {
            const isSelected = selectedLayerId === layer.id;
            const isHidden = hiddenLayerIds.has(layer.id);
            const color = LAYER_COLORS[i % LAYER_COLORS.length];

            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`group flex items-center gap-1.5 border-b border-[var(--border)] px-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]'
                } ${isHidden ? 'opacity-40' : ''}`}
                style={{ height: TRACK_HEIGHT }}
              >
                {/* Track controls */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    title={isHidden ? 'Show' : 'Hide'}
                    className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
                  >
                    {isHidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                  </button>
                  {layer.type === 'video' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleAudio?.(layer.id); }}
                      title={layer.audioDetached ? 'Unmute audio' : 'Mute / detach audio'}
                      className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] ${
                        layer.audioDetached ? 'text-red-400' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {layer.audioDetached ? <VolumeX className="h-2.5 w-2.5" /> : <Volume2 className="h-2.5 w-2.5" />}
                    </button>
                  )}
                </div>

                {/* Color dot */}
                <div
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />

                {/* Type icon + name */}
                {layer.type === 'video' ? (
                  <Film className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                ) : (
                  <ImageIcon className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                )}
                <span className="truncate text-[10px] font-medium text-[var(--text)]">
                  {layer.source.label || `Layer ${i + 1}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Timeline Tracks Content ────────────────── */}
        <div className="relative flex-1" style={{ minWidth: timelineWidth + 40 }}>
          {/* ── Time Ruler ───────────────────────────── */}
          <div
            className="relative cursor-pointer border-b border-[var(--border)] bg-[var(--muted)]"
            style={{ height: RULER_HEIGHT }}
            onClick={handleRulerClick}
          >
            {ticks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{ left: tick.x }}
              >
                <div
                  className={`w-px ${tick.major ? 'h-full opacity-20' : 'h-2/5 opacity-10'}`}
                  style={{ position: 'absolute', bottom: 0, backgroundColor: 'var(--text)' }}
                />
                {tick.label && (
                  <span
                    className="absolute text-[9px] font-medium tabular-nums text-[var(--text-muted)]"
                    style={{ bottom: 4, left: 4 }}
                  >
                    {tick.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* ── Track Rows ───────────────────────────── */}
          {layers.map((layer, i) => {
            const dur = videoDurations.get(layer.id) ?? 10;
            const isVideo = layer.type === 'video';
            const trimStart = isVideo ? (layer.trim?.startSec ?? 0) : 0;
            const trimEnd = isVideo ? (layer.trim?.endSec ?? dur) : totalDuration - 2;
            const barLeft = trimStart * pps;
            const barWidth = (trimEnd - trimStart) * pps;
            const color = LAYER_COLORS[i % LAYER_COLORS.length];
            const isSelected = selectedLayerId === layer.id;
            const isHidden = hiddenLayerIds.has(layer.id);

            return (
              <div
                key={layer.id}
                className={`relative border-b border-[var(--border)] transition-colors ${
                  isSelected ? 'bg-[var(--accent)]' : 'bg-[var(--background)]'
                } ${isHidden ? 'opacity-30' : ''}`}
                style={{ height: TRACK_HEIGHT }}
                onClick={() => onSelectLayer(layer.id)}
              >
                {/* Clip bar */}
                <div
                  className={`absolute top-1.5 bottom-1.5 rounded-md cursor-pointer overflow-hidden transition-shadow ${
                    isSelected ? 'ring-1 ring-[var(--primary)]/40 shadow-lg' : ''
                  }`}
                  style={{
                    left: barLeft,
                    width: Math.max(barWidth, 8),
                    backgroundColor: color,
                  }}
                >
                  {/* Frame thumbnails (video layers) */}
                  {isVideo && layer.source.url && (
                    <TrackClipFrames videoUrl={layer.source.url} clipWidth={barWidth} />
                  )}

                  {/* Image thumbnail (image layers) */}
                  {!isVideo && layer.source.url && (
                    <div className="absolute inset-0 opacity-40">
                      <img
                        src={layer.source.url}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </div>
                  )}

                  {/* Gradient overlay for readability */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, ${color}cc 0%, ${color}99 40%, ${color}66 100%)`,
                    }}
                  />

                  {/* Label inside bar — always white text on colored background */}
                  <div className="relative flex h-full items-center px-2 gap-1.5">
                    {layer.type === 'video' ? (
                      <Film className="h-3 w-3 shrink-0 text-white/70" />
                    ) : (
                      <ImageIcon className="h-3 w-3 shrink-0 text-white/70" />
                    )}
                    <span className="truncate text-[10px] font-semibold text-white drop-shadow-sm">
                      {layer.source.label || `Layer ${i + 1}`}
                    </span>
                    {isVideo && (
                      <span className="ml-auto shrink-0 text-[9px] tabular-nums text-white/60">
                        {formatTimeShort(trimEnd - trimStart)}
                      </span>
                    )}
                  </div>

                  {/* Trim handles (video layers only) */}
                  {isVideo && (
                    <>
                      {/* Left trim handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 z-10 flex items-center cursor-ew-resize group/handle"
                        style={{ width: 10, touchAction: 'none' }}
                        onPointerDown={(e) => handleTrimPointerDown(e, layer.id, 'start')}
                      >
                        <div className="h-full w-[4px] rounded-l-md bg-white/40 transition-all group-hover/handle:w-[6px] group-hover/handle:bg-white/80">
                          <div className="flex h-full flex-col items-center justify-center gap-[2px]">
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                          </div>
                        </div>
                      </div>
                      {/* Right trim handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-end cursor-ew-resize group/handle"
                        style={{ width: 10, touchAction: 'none' }}
                        onPointerDown={(e) => handleTrimPointerDown(e, layer.id, 'end')}
                      >
                        <div className="h-full w-[4px] rounded-r-md bg-white/40 transition-all group-hover/handle:w-[6px] group-hover/handle:bg-white/80">
                          <div className="flex h-full flex-col items-center justify-center gap-[2px]">
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                            <div className="h-[3px] w-[1px] rounded-full bg-black/30" />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Playhead ─────────────────────────────── */}
          <div
            className="absolute z-20 pointer-events-none"
            style={{ left: playheadX, top: 0, bottom: 0 }}
          >
            {/* Triangle marker at top */}
            <div
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: 'none' }}
              onPointerDown={handlePlayheadPointerDown}
            >
              <svg
                width="14"
                height="12"
                viewBox="0 0 14 12"
                className="absolute -translate-x-1/2"
                style={{ top: -1, left: 0 }}
              >
                <polygon points="0,0 14,0 7,12" fill="#ef4444" />
              </svg>
            </div>
            {/* Red line */}
            <div
              className="absolute w-px bg-red-500/80"
              style={{ left: 0, top: 0, bottom: 0, transform: 'translateX(-0.5px)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
