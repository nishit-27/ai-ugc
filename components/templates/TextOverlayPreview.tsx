'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { TextOverlayConfig } from '@/types';
import { TEXT_STYLES } from './textStyles';

const VIDEO_WIDTH = 720;

/**
 * Shared wrapping logic — identical to ffmpegOps so preview == video.
 *
 * Rules:
 *  • wordsPerLine > 0  →  wrap ONLY by word count (user's explicit choice)
 *  • wordsPerLine = 0  →  wrap by character-width (auto fit to margins)
 *  These two modes are mutually exclusive; word-count is never overridden.
 */
function computeWrappedText(
  raw: string,
  wordsPerLine: number | undefined,
  paddingLeft: number,
  paddingRight: number,
  fontSize: number,
): string {
  let wrapped = raw;
  const wpl = wordsPerLine ?? 0;

  if (wpl > 0) {
    // ── Word-count wrapping: exact words per line, nothing else ──
    wrapped = wrapped
      .split('\n')
      .map((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) return '';
        if (words.length <= wpl) return words.join(' ');
        const lines: string[] = [];
        for (let i = 0; i < words.length; i += wpl) {
          lines.push(words.slice(i, i + wpl).join(' '));
        }
        return lines.join('\n');
      })
      .join('\n');
  } else {
    // ── Character-width wrapping: auto-fit based on margins ──
    const effectiveLeft = paddingLeft > 0 ? paddingLeft : 90;
    const effectiveRight = paddingRight > 0 ? paddingRight : 90;
    const availableWidth = VIDEO_WIDTH - effectiveLeft - effectiveRight;
    const charWidth = fontSize * 0.55;
    const maxChars = Math.max(5, Math.floor(availableWidth / charWidth));

    wrapped = wrapped
      .split('\n')
      .map((line) => {
        if (line.length <= maxChars) return line;
        const words = line.split(/\s+/);
        const subLines: string[] = [];
        let current = '';
        for (const word of words) {
          if (current.length === 0) {
            current = word;
          } else if (current.length + 1 + word.length <= maxChars) {
            current += ' ' + word;
          } else {
            subLines.push(current);
            current = word;
          }
        }
        if (current) subLines.push(current);
        return subLines.join('\n');
      })
      .join('\n');
  }

  return wrapped;
}

export default function TextOverlayPreview({
  config,
  onChange,
  videoUrl,
  isLoadingVideo,
  isExpanded,
}: {
  config: TextOverlayConfig;
  onChange: (config: TextOverlayConfig) => void;
  videoUrl?: string;
  isLoadingVideo?: boolean;
  isExpanded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [defaultVideoUrl, setDefaultVideoUrl] = useState<string | null>(null);

  /* ── Measure container so we can scale exactly ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width);
        setContainerHeight(e.contentRect.height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Scale factor: 1 video-pixel → `scale` preview-pixels
  const scale = containerWidth > 0 ? containerWidth / VIDEO_WIDTH : 0.27;

  useEffect(() => {
    if (videoUrl) return;
    fetch('/api/settings/preview_video_url')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.value) setDefaultVideoUrl(data.value); })
      .catch(() => {});
  }, [videoUrl]);

  const activeStyle = useMemo(
    () => TEXT_STYLES.find((s) => s.id === (config.textStyle || 'plain')),
    [config.textStyle],
  );

  const activeZone = useCallback((): 'top' | 'center' | 'bottom' => {
    if (!isDragging || containerHeight === 0) {
      if (config.position === 'custom') return 'center';
      return config.position;
    }
    const ratio = dragY / containerHeight;
    if (ratio < 0.33) return 'top';
    if (ratio < 0.67) return 'center';
    return 'bottom';
  }, [isDragging, dragY, containerHeight, config.position]);

  /* ── Wrapped text (same algo as ffmpeg) ── */
  const formattedText = useMemo(
    () =>
      computeWrappedText(
        config.text || '',
        config.wordsPerLine,
        config.paddingLeft ?? 0,
        config.paddingRight ?? 0,
        config.fontSize,
      ),
    [config.text, config.wordsPerLine, config.paddingLeft, config.paddingRight, config.fontSize],
  );

  const align = config.textAlign || 'center';
  const pL = (config.paddingLeft ?? 0) * scale;
  const pR = (config.paddingRight ?? 0) * scale;
  const effectiveLeft = (config.paddingLeft ?? 0) > 0 ? pL : 90 * scale;
  const effectiveRight = (config.paddingRight ?? 0) > 0 ? pR : 90 * scale;

  /* ── Build inline style for the text element ── */
  const getTextStyle = (): React.CSSProperties => {
    const baseFontSize = Math.max(8, config.fontSize * scale);

    const base: React.CSSProperties = {
      fontSize: `${baseFontSize}px`,
      color: config.fontColor,
      textShadow:
        !config.bgColor && !activeStyle?.css?.textShadow
          ? '1px 1px 3px rgba(0,0,0,0.9)'
          : undefined,
      pointerEvents: 'auto' as const,
      userSelect: 'none' as const,
      cursor: config.position === 'custom' ? 'move' : 'grab',
      textAlign: align as React.CSSProperties['textAlign'],
      lineHeight: 1.3,
      fontFamily: config.fontFamily || 'sans-serif',
      whiteSpace: 'pre' as const, // ONLY break at \n from formattedText
    };

    // Style preset
    if (activeStyle && activeStyle.id !== 'plain') {
      Object.assign(base, activeStyle.css);
      if (activeStyle.css.padding) base.padding = activeStyle.css.padding;
      base.fontSize = `${baseFontSize}px`;
      if (config.fontFamily && !activeStyle.css.fontFamily) {
        base.fontFamily = config.fontFamily;
      }
    }

    // Background box
    if (config.bgColor && !activeStyle?.css?.backgroundColor) {
      base.backgroundColor = `${config.bgColor}b3`;
      base.padding = `${Math.round(2 * scale)}px ${Math.round(10 * scale)}px`;
      base.borderRadius = `${Math.round(4 * scale)}px`;
    }

    /* ── Custom position ── */
    if (config.position === 'custom') {
      base.position = 'absolute';
      base.top = `${config.customY ?? 50}%`;
      base.left = `${config.customX ?? 50}%`;
      if (align === 'left') {
        base.transform = 'translateY(-50%)';
      } else if (align === 'right') {
        base.transform = 'translate(-100%, -50%)';
      } else {
        base.transform = 'translate(-50%, -50%)';
      }
      if (isDragging) base.cursor = 'grabbing';
      return base;
    }

    /* ── Preset position (top / center / bottom) ── */
    base.position = 'absolute';

    // Horizontal anchor
    if (align === 'left') {
      base.left = `${effectiveLeft}px`;
    } else if (align === 'right') {
      base.right = `${effectiveRight}px`;
    } else {
      base.left = '50%';
      if (pL !== pR) {
        base.left = `calc(50% + ${(pL - pR) / 2}px)`;
      }
    }

    // Vertical position
    const xTx = align === 'center' ? 'translateX(-50%)' : '';

    if (isDragging) {
      base.top = `${dragY}px`;
      base.transform = [xTx, 'translateY(-50%)'].filter(Boolean).join(' ') || undefined;
      base.cursor = 'grabbing';
    } else {
      switch (config.position) {
        case 'top':
          base.top = '12%';
          base.transform = xTx || undefined;
          break;
        case 'center':
          base.top = '50%';
          base.transform = [xTx, 'translateY(-50%)'].filter(Boolean).join(' ') || undefined;
          break;
        case 'bottom':
          base.bottom = '12%';
          base.transform = xTx || undefined;
          break;
      }
    }

    return base;
  };

  /* ── Drag: preset positions ── */
  const handlePointerDown = (e: React.PointerEvent) => {
    if (config.position === 'custom') {
      handleCustomDragStart(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerHeight(rect.height);
      setDragY(e.clientY - rect.top);
      setIsDragging(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (config.position === 'custom') {
      handleCustomDragMove(e);
      return;
    }
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = Math.max(20, Math.min(e.clientY - rect.top, rect.height - 20));
    setDragY(y);
    setContainerHeight(rect.height);
  };

  const handlePointerUp = () => {
    if (config.position === 'custom') {
      setIsDragging(false);
      return;
    }
    if (!isDragging) return;
    setIsDragging(false);
    onChange({ ...config, position: activeZone() });
  };

  /* ── Drag: custom position ── */
  const handleCustomDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateCustomPos(e);
  };

  const handleCustomDragMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    updateCustomPos(e);
  };

  const updateCustomPos = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    onChange({ ...config, customX: Math.round(x), customY: Math.round(y) });
  };

  const zone = activeZone();

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
        Preview {config.position === 'custom' ? '— drag to position' : '— drag text to reposition'}
      </label>
      <div
        ref={containerRef}
        className="relative mx-auto overflow-hidden rounded-xl bg-[#9ca3af] dark:bg-[#2a2a2a]"
        style={{ aspectRatio: '9/16', maxHeight: isExpanded ? 600 : 340 }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Video or placeholder */}
        {(videoUrl || defaultVideoUrl) ? (
          <video
            src={videoUrl || defaultVideoUrl!}
            className="h-full w-full object-contain"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              {isLoadingVideo ? (
                <>
                  <div className="mx-auto mb-2 h-5 w-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  <span className="text-[10px] text-white/40">Loading video...</span>
                </>
              ) : (
                <>
                  <div className="mb-1 text-2xl opacity-30">&#9654;</div>
                  <span className="text-[10px] text-white/40">Video Preview</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Drop zone indicators */}
        {isDragging && config.position !== 'custom' && (
          <>
            <div className={`absolute inset-x-3 top-3 flex h-[28%] items-center justify-center rounded-lg border-2 border-dashed transition-all ${zone === 'top' ? 'border-white/40 bg-white/10' : 'border-white/20'}`}>
              <span className={`text-[10px] font-medium ${zone === 'top' ? 'text-white/60' : 'text-white/30'}`}>Top</span>
            </div>
            <div className={`absolute inset-x-3 top-[36%] flex h-[28%] items-center justify-center rounded-lg border-2 border-dashed transition-all ${zone === 'center' ? 'border-white/40 bg-white/10' : 'border-white/20'}`}>
              <span className={`text-[10px] font-medium ${zone === 'center' ? 'text-white/60' : 'text-white/30'}`}>Center</span>
            </div>
            <div className={`absolute inset-x-3 bottom-3 flex h-[28%] items-center justify-center rounded-lg border-2 border-dashed transition-all ${zone === 'bottom' ? 'border-white/40 bg-white/10' : 'border-white/20'}`}>
              <span className={`text-[10px] font-medium ${zone === 'bottom' ? 'text-white/60' : 'text-white/30'}`}>Bottom</span>
            </div>
          </>
        )}

        {/* Crosshair for custom (no text) */}
        {config.position === 'custom' && !config.text && (
          <div
            className="absolute pointer-events-none"
            style={{ left: `${config.customX ?? 50}%`, top: `${config.customY ?? 50}%` }}
          >
            <div className="h-px w-6 -translate-x-1/2 bg-white/40" />
            <div className="h-6 w-px -translate-x-1/2 -translate-y-3 bg-white/40" />
          </div>
        )}

        {/* Text overlay */}
        {config.text && (
          <div
            className="absolute"
            style={getTextStyle()}
            onPointerDown={handlePointerDown}
          >
            {formattedText}
          </div>
        )}

        {/* Placeholder when no text (preset modes) */}
        {!isDragging && !config.text && config.position !== 'custom' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded border border-dashed border-white/30 px-6 py-1"
            style={
              config.position === 'top'
                ? { top: '12%' }
                : config.position === 'center'
                  ? { top: '50%', transform: 'translateX(-50%) translateY(-50%)' }
                  : { bottom: '12%' }
            }
          >
            <span className="text-[10px] text-white/40">Text here</span>
          </div>
        )}
      </div>
    </div>
  );
}
