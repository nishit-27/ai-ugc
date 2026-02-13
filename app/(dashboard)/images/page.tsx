'use client';

import { useState } from 'react';
import type { GeneratedImage } from '@/types';
import { useGeneratedImages } from '@/hooks/useGeneratedImages';
import RefreshButton from '@/components/ui/RefreshButton';
import ImageGallery from '@/components/images/ImageGallery';
import ImagePreviewModal from '@/components/images/ImagePreviewModal';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ImagesPage() {
  const { images, isLoadingPage, refresh, deleteImage, page, setPage, totalPages, total } = useGeneratedImages();
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Images</h1>
          <p className="text-[var(--text-muted)]">
            Generated first-frame images{total > 0 && <span className="ml-1">({total})</span>}
          </p>
        </div>
        <RefreshButton onClick={refresh} />
      </div>

      <ImageGallery
        images={images}
        isLoading={isLoadingPage}
        onImageClick={(image) => setPreviewImage(image)}
        onDelete={deleteImage}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1]) > 1) acc.push('dots');
              acc.push(p);
              return acc;
            }, [])
            .map((item, i) =>
              item === 'dots' ? (
                <span key={`dots-${i}`} className="px-1 text-[var(--text-muted)]">...</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={`flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-medium transition-colors ${
                    page === item
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent)]'
                  }`}
                >
                  {item}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <ImagePreviewModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        image={previewImage}
      />
    </div>
  );
}
