'use client';

import { useState } from 'react';
import Image from 'next/image';
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

function ShimmerFill() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[var(--accent)]">
      <div className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20 animate-[shimmer_1.3s_linear_infinite]" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <ShimmerFill />
    </div>
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
  const [loadedById, setLoadedById] = useState<Record<string, true>>({});

  const markLoaded = (id: string) => {
    setLoadedById((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

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
      {images.map((image, index) => {
        const displayUrl = image.signedUrl
          || (image.gcsUrl && !image.gcsUrl.includes('storage.googleapis.com') ? image.gcsUrl : '');
        const isLoaded = !!loadedById[image.id];
        return (
        <div
          key={image.id}
          className="group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-lg"
          onClick={() => onImageClick(image)}
        >
          <div className="relative aspect-[3/4] overflow-hidden bg-[var(--accent)]">
            {displayUrl ? (
              <>
                <Image
                  src={displayUrl}
                  alt={image.filename}
                  fill
                  priority={index < 4}
                  quality={70}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className={`h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-105 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => markLoaded(image.id)}
                  onError={() => markLoaded(image.id)}
                />
                {!isLoaded && <ShimmerFill />}
              </>
            ) : (
              <ShimmerFill />
            )}
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
              {image.createdBy && (
                <span className="ml-1.5 text-white/60">By {image.createdBy}</span>
              )}
              {image.promptVariant && (
                <span className="ml-1.5 rounded bg-white/20 px-1 py-0.5 text-[10px]">
                  {image.promptVariant}
                </span>
              )}
            </p>
          </div>
        </div>
        );
      })}
    </div>
  );
}
