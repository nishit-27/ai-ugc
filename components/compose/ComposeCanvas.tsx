'use client';

import { useRef, useEffect, useCallback } from 'react';
import { ImageIcon, Plus } from 'lucide-react';
import { PRESETS } from './presets';
import type { ComposePresetId, ComposeLayer } from '@/types';

type ComposeCanvasProps = {
  onInit: (canvasEl: HTMLCanvasElement, containerWidth: number) => void;
  onResize: (containerWidth: number) => void;
  aspectRatio: number; // width / height
  preset: ComposePresetId | null;
  layers: ComposeLayer[];
  onSlotClick?: (slotIndex: number) => void;
  pendingSlotIndex?: number | null;
  zoom?: number; // 1 = 100%
};

export default function ComposeCanvas({
  onInit,
  onResize,
  aspectRatio,
  preset,
  layers,
  onSlotClick,
  pendingSlotIndex,
  zoom = 1,
}: ComposeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialized = useRef(false);

  const getContainerWidth = useCallback(() => {
    if (!containerRef.current) return 400;
    const rect = containerRef.current.getBoundingClientRect();
    const maxW = Math.max(rect.width - 32, 100);
    const maxH = Math.max(rect.height - 32, 100);
    const fitByWidth = maxW;
    const fitByHeight = maxH * aspectRatio;
    return Math.max(100, Math.min(fitByWidth, fitByHeight, 800));
  }, [aspectRatio]);

  useEffect(() => {
    if (!canvasRef.current || initialized.current) return;
    const w = getContainerWidth();
    onInit(canvasRef.current, w);
    initialized.current = true;
  }, [onInit, getContainerWidth]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (!initialized.current) return;
      const w = getContainerWidth();
      onResize(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResize, getContainerWidth]);

  // Determine empty preset slots
  const presetDef = preset ? PRESETS[preset] : null;
  const presetSlots = presetDef ? presetDef.getPositions() : [];
  const emptySlots = presetSlots.slice(layers.length);
  const displayW = getContainerWidth();
  const displayH = displayW / aspectRatio;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-auto bg-[var(--muted)] p-4"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div
        className="relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-[var(--border)]"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <canvas ref={canvasRef} />

        {emptySlots.length > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ width: displayW, height: displayH }}
          >
            {emptySlots.map((slot, i) => {
              const globalIndex = layers.length + i;
              const isSelected = pendingSlotIndex === globalIndex;
              return (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSlotClick?.(globalIndex);
                  }}
                  className={`pointer-events-auto absolute flex flex-col items-center justify-center gap-1 transition-all ${
                    isSelected
                      ? 'bg-[var(--primary)]/15'
                      : 'hover:bg-[var(--accent)]'
                  }`}
                  style={{
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    width: `${slot.width * 100}%`,
                    height: `${slot.height * 100}%`,
                    border: isSelected
                      ? '2px solid var(--primary)'
                      : '2px dashed var(--text-muted)',
                    borderRadius: 8,
                  }}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm ${
                    isSelected ? 'bg-[var(--primary)]/30' : 'bg-[var(--accent)]'
                  }`}>
                    <Plus className={`h-4 w-4 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                  </div>
                  <span className={`text-[10px] font-medium ${
                    isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                  }`}>
                    {isSelected ? 'Add media from panel' : `Slot ${globalIndex + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!preset && layers.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] backdrop-blur-sm">
              <ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
            </div>
            <p className="text-xs font-medium text-[var(--text-muted)]">Choose a preset or add media</p>
          </div>
        )}
      </div>
    </div>
  );
}
