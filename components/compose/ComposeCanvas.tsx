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
};

export default function ComposeCanvas({
  onInit,
  onResize,
  aspectRatio,
  preset,
  layers,
  onSlotClick,
}: ComposeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialized = useRef(false);

  const getContainerWidth = useCallback(() => {
    if (!containerRef.current) return 400;
    const rect = containerRef.current.getBoundingClientRect();
    const maxW = rect.width - 32;
    const maxH = rect.height - 32;
    const fitByWidth = maxW;
    const fitByHeight = maxH * aspectRatio;
    return Math.min(fitByWidth, fitByHeight, 800);
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
  const emptySlots = presetSlots.slice(layers.length); // slots beyond current layers
  const displayW = getContainerWidth();
  const displayH = displayW / aspectRatio;

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center bg-[var(--background)] p-4"
    >
      <div
        className="relative overflow-hidden rounded-lg shadow-lg"
        style={{ backgroundColor: '#000' }}
      >
        <canvas ref={canvasRef} />

        {emptySlots.length > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ width: displayW, height: displayH }}
          >
            {emptySlots.map((slot, i) => {
              const globalIndex = layers.length + i;
              return (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSlotClick?.(globalIndex);
                  }}
                  className="pointer-events-auto absolute flex flex-col items-center justify-center gap-1 transition-colors hover:bg-white/10"
                  style={{
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    width: `${slot.width * 100}%`,
                    height: `${slot.height * 100}%`,
                    border: '2px dashed rgba(255,255,255,0.35)',
                    borderRadius: 8,
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
                    <Plus className="h-4 w-4 text-white/60" />
                  </div>
                  <span className="text-[10px] font-medium text-white/50">
                    Slot {globalIndex + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!preset && layers.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
              <ImageIcon className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-xs font-medium text-white/40">Choose a preset or add media</p>
          </div>
        )}
      </div>
    </div>
  );
}
