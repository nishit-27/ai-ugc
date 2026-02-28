'use client';

import { Play, Pause, LayoutGrid, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { ASPECT_RATIO_DIMENSIONS } from './presets';
import type { ComposeAspectRatio } from '@/types';

type ComposeToolbarProps = {
  aspectRatio: ComposeAspectRatio;
  onAspectRatioChange: (ratio: ComposeAspectRatio) => void;
  onPresetPick: () => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onRender?: () => void;
  isRendering?: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomFit: () => void;
  onFullscreen?: () => void;
};

const ASPECT_OPTIONS: ComposeAspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

export default function ComposeToolbar({
  aspectRatio,
  onAspectRatioChange,
  onPresetPick,
  backgroundColor,
  onBackgroundColorChange,
  isPlaying,
  onPlayPause,
  onRender,
  isRendering,
  zoom,
  onZoomChange,
  onZoomFit,
  onFullscreen,
}: ComposeToolbarProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 backdrop-blur-xl">
      {/* Aspect ratio */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">Ratio</span>
        <select
          value={aspectRatio}
          onChange={(e) => onAspectRatioChange(e.target.value as ComposeAspectRatio)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
        >
          {ASPECT_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Presets */}
      <button
        onClick={onPresetPick}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Presets
      </button>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Background color */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">BG</span>
        <input
          type="color"
          value={backgroundColor}
          onChange={(e) => onBackgroundColorChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-[var(--border)]"
        />
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Playback */}
      <button
        onClick={onPlayPause}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
          title="Zoom Out"
          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3rem] text-center text-[11px] font-medium text-[var(--text-muted)]">
          {zoomPercent}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
          title="Zoom In"
          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onFullscreen ?? onZoomFit}
          title="Fullscreen"
          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Render */}
      {onRender && (
        <button
          onClick={onRender}
          disabled={isRendering}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
        >
          {isRendering ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          Render
        </button>
      )}
    </div>
  );
}
