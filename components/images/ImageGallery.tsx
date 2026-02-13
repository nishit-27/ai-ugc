'use client';

import { Trash2 } from 'lucide-react';
import type { GeneratedImage } from '@/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SkeletonCard() {
  return (
    <div className="aspect-[3/4] animate-pulse rounded-lg bg-[var(--accent)]" />
  );
}

export default function ImageGallery({
  images,
  isLoading,
  onImageClick,
  onDelete,
}: {
  images: GeneratedImage[];
  isLoading: boolean;
  onImageClick: (image: GeneratedImage) => void;
  onDelete: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20 text-center">
        <p className="text-lg font-medium text-[var(--text)]">No images yet</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Generated first-frame images will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <div
          key={image.id}
          className="group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-lg"
          onClick={() => onImageClick(image)}
        >
          <div className="aspect-[3/4] overflow-hidden">
            <img
              src={image.signedUrl || image.gcsUrl}
              alt={image.filename}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>

          {/* Hover overlay with delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image.id);
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Date label */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
            <p className="text-[11px] text-white/80">
              {formatDate(image.createdAt)}
              {image.promptVariant && (
                <span className="ml-1.5 rounded bg-white/20 px-1 py-0.5 text-[10px]">
                  {image.promptVariant}
                </span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
