'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { TextOverlayConfig } from '@/types';
import { TEXT_STYLES } from './textStyles';

export default function TextOverlayPreview({
  config,
  onChange,
  videoUrl,
}: {
  config: TextOverlayConfig;
  onChange: (config: TextOverlayConfig) => void;
  videoUrl?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [defaultVideoUrl, setDefaultVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (videoUrl) return;
    fetch('/api/settings/preview_video_url')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.value) setDefaultVideoUrl(data.value); })
      .catch(() => {});
  }, [videoUrl]);

  const activeStyle = useMemo(() => {
    return TEXT_STYLES.find((s) => s.id === (config.textStyle || 'plain'));
  }, [config.textStyle]);

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

  // Left/right margins control text width (how many words per line)
  // Scale for preview: preview container is roughly 0.27x of a 720px video
  const pL = (config.paddingLeft ?? 0) * 0.27;
  const pR = (config.paddingRight ?? 0) * 0.27;

  // Compute wrapped text using the SAME algorithm as ffmpeg so preview matches the video output
  const formattedText = useMemo(() => {
    const raw = config.text || '';
    let wrapped = raw;

    // Step 1: wrap by word count (mirrors ffmpeg wrapByWordCount)
    const wpl = config.wordsPerLine;
    if (wpl && wpl > 0) {
      wrapped = wrapped.split('\n').map((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length <= wpl) return paragraph;
        const lines: string[] = [];
        for (let i = 0; i < words.length; i += wpl) {
          lines.push(words.slice(i, i + wpl).join(' '));
        }
        return lines.join('\n');
      }).join('\n');
    }

    // Step 2: wrap by character width (mirrors ffmpeg wrapText with same defaults)
    const padL = config.paddingLeft ?? 0;
    const padR = config.paddingRight ?? 0;
    const effectiveLeft = padL > 0 ? padL : 90;
    const effectiveRight = padR > 0 ? padR : 90;
    const videoWidth = 720;
    const availableWidth = videoWidth - effectiveLeft - effectiveRight;
    const charWidth = config.fontSize * 0.55;
    const maxChars = Math.max(5, Math.floor(availableWidth / charWidth));

    wrapped = wrapped.split('\n').map((line) => {
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
    }).join('\n');

    return wrapped;
  }, [config.text, config.wordsPerLine, config.paddingLeft, config.paddingRight, config.fontSize]);

  const getTextStyle = (): React.CSSProperties => {
    const baseFontSize = Math.max(10, config.fontSize * 0.3);

    const base: React.CSSProperties = {
      fontSize: `${baseFontSize}px`,
      color: config.fontColor,
      textShadow: !config.bgColor && !activeStyle?.css?.textShadow ? '1px 1px 3px rgba(0,0,0,0.9)' : undefined,
      pointerEvents: 'auto' as const,
      userSelect: 'none' as const,
      cursor: config.position === 'custom' ? 'move' : 'grab',
      maxWidth: '90%',
      textAlign: 'center' as const,
      lineHeight: 1.3,
      fontFamily: config.fontFamily || 'sans-serif',
      whiteSpace: 'pre-wrap' as const,
      overflowWrap: 'break-word' as const,
    };

    // Apply style preset
    if (activeStyle && activeStyle.id !== 'plain') {
      Object.assign(base, activeStyle.css);
      if (activeStyle.css.padding) {
        base.padding = activeStyle.css.padding;
      }
      base.fontSize = `${baseFontSize}px`;
      if (config.fontFamily && !activeStyle.css.fontFamily) {
        base.fontFamily = config.fontFamily;
      }
    }

    if (config.bgColor && !activeStyle?.css?.backgroundColor) {
      base.backgroundColor = `${config.bgColor}b3`;
      base.padding = '2px 10px';
      base.borderRadius = '4px';
    }

    // Position: custom uses absolute X,Y percentages
    if (config.position === 'custom') {
      base.position = 'absolute';
      base.left = `${config.customX ?? 50}%`;
      base.top = `${config.customY ?? 50}%`;
      base.transform = 'translate(-50%, -50%)';
      if (isDragging) base.cursor = 'grabbing';
      return base;
    }

    // Position: preset zones with drag support
    base.position = 'absolute';
    base.left = '50%';

    // Shift horizontally if left/right margins differ
    if (pL !== pR) {
      const hOffset = (pL - pR) / 2;
      base.left = `calc(50% + ${hOffset}px)`;
    }

    if (isDragging) {
      base.top = `${dragY}px`;
      base.transform = 'translateX(-50%) translateY(-50%)';
      base.cursor = 'grabbing';
    } else {
      switch (config.position) {
        case 'top':
          base.top = '12%';
          base.transform = 'translateX(-50%)';
          break;
        case 'center':
          base.top = '50%';
          base.transform = 'translateX(-50%) translateY(-50%)';
          break;
        case 'bottom':
          base.bottom = '12%';
          base.transform = 'translateX(-50%)';
          break;
      }
    }

    return base;
  };

  /* ── Drag for preset positions (top/center/bottom) ── */
  const handlePointerDown = (e: React.PointerEvent) => {
    if (config.position === 'custom') {
      handleCustomDragStart(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

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

  /* ── Drag for custom position ── */
  const handleCustomDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
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
        style={{ aspectRatio: '9/16', maxHeight: 340 }}
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
              <div className="mb-1 text-2xl opacity-30">&#9654;</div>
              <span className="text-[10px] text-white/40">Video Preview</span>
            </div>
          </div>
        )}

        {/* Drop zone indicators (only for preset positions) */}
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

        {/* Crosshair for custom position (when not dragging text) */}
        {config.position === 'custom' && !config.text && (
          <div
            className="absolute pointer-events-none"
            style={{ left: `${config.customX ?? 50}%`, top: `${config.customY ?? 50}%` }}
          >
            <div className="h-px w-6 -translate-x-1/2 bg-white/40" />
            <div className="h-6 w-px -translate-x-1/2 -translate-y-3 bg-white/40" />
          </div>
        )}

        {/* Draggable text overlay */}
        {config.text && (
          <div
            className="absolute"
            style={getTextStyle()}
            onPointerDown={handlePointerDown}
          >
            {formattedText}
          </div>
        )}

        {/* Position indicator when not dragging and no text (preset modes) */}
        {!isDragging && !config.text && config.position !== 'custom' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded border border-dashed border-white/30 px-6 py-1"
            style={config.position === 'top' ? { top: '12%' } : config.position === 'center' ? { top: '50%', transform: 'translateX(-50%) translateY(-50%)' } : { bottom: '12%' }}
          >
            <span className="text-[10px] text-white/40">Text here</span>
          </div>
        )}
      </div>
    </div>
  );
}
