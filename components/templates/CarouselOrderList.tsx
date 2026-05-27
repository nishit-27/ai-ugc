'use client';

import { GripVertical, X, ImageIcon } from 'lucide-react';
import type { CarouselImageEntry } from '@/types';
import { ordinal } from './carouselStepHelpers';

// Carousel reorder list with drag-and-drop. Pure presentational —
// drag state and handlers live in the parent so the parent stays the
// source of truth for image order.
export default function CarouselOrderList({
  images,
  getImageUrl,
  onRemove,
  onPreview,
  onDragStart,
  onDragOver,
  onDragEnd,
  dragIndex,
  dragOverIndex,
}: {
  images: CarouselImageEntry[];
  getImageUrl: (entry: CarouselImageEntry) => string | null;
  onRemove: (index: number) => void;
  onPreview: (url: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
}) {
  if (images.length === 0) return null;
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Carousel Order (drag to reorder)
      </label>
      <div className="space-y-1.5">
        {images.map((entry, index) => {
          const url = getImageUrl(entry);
          return (
            <div
              key={`${entry.imageId || entry.imageUrl}-${index}`}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-2 rounded-lg border bg-[var(--surface)] p-1.5 transition-all ${
                dragOverIndex === index ? 'border-[var(--primary)]/60 bg-[var(--accent)] dark:bg-[var(--primary)]/10' : 'border-[var(--border)]'
              } ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--border)]" />
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]">
                {index + 1}
              </div>
              {url ? (
                <img
                  src={url}
                  alt={entry.filename || `Image ${index + 1}`}
                  className="h-10 w-10 shrink-0 rounded object-cover cursor-pointer"
                  onClick={() => onPreview(url)}
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-[var(--accent)] flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs text-[var(--text)]">
                  {entry.filename || `Image ${index + 1}`}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{ordinal(index + 1)} in carousel</span>
              </div>
              <button
                onClick={() => onRemove(index)}
                className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
