'use client';

import type { CarouselImageEntry } from '@/types';

// TikTok carousel cover-photo picker — purely presentational.
export default function CarouselCoverPicker({
  images,
  coverIndex,
  getImageUrl,
  onSelect,
}: {
  images: CarouselImageEntry[];
  coverIndex: number;
  getImageUrl: (entry: CarouselImageEntry) => string | null;
  onSelect: (index: number) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Cover Photo (TikTok)
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {images.map((entry, index) => {
          const url = getImageUrl(entry);
          const isCover = coverIndex === index;
          return (
            <button
              key={index}
              onClick={() => onSelect(index)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                isCover ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
              }`}
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[var(--accent)]" />
              )}
              {isCover && (
                <div className="absolute bottom-0 inset-x-0 bg-[var(--primary)] py-0.5 text-center text-[8px] font-bold text-[var(--primary-foreground)]">
                  COVER
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
