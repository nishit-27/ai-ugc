'use client';

import { useState } from 'react';
import type { GeneratedImage } from '@/types';
import { useGeneratedImages } from '@/hooks/useGeneratedImages';
import { useModelFilterOptions } from '@/hooks/useModelFilterOptions';
import ImageGallery from '@/components/images/ImageGallery';
import ImagePreviewModal from '@/components/images/ImagePreviewModal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ModelDateToolbar from '@/components/media/ModelDateToolbar';
import type { DateFilterValue } from '@/types/media-filters';
import PageTransition from '@/components/ui/PageTransition';

export default function ImagesPage() {
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('newest');
  const { models: modelOptions } = useModelFilterOptions();
  const { images, isLoadingPage, refresh, deleteImage, page, setPage, totalPages, total } = useGeneratedImages({
    modelId: modelFilter === 'all' ? undefined : modelFilter,
    dateFilter,
  });
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);

  return (
    <PageTransition>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Images</h1>
          <p className="text-[var(--text-muted)]">
            Generated first-frame images{total > 0 && <span className="ml-1">({total})</span>}
          </p>
        </div>
        <ModelDateToolbar
          modelId={modelFilter}
          onModelChange={(value) => {
            setModelFilter(value);
            setPage(1);
          }}
          dateFilter={dateFilter}
          onDateFilterChange={(value) => {
            setDateFilter(value);
            setPage(1);
          }}
          modelOptions={modelOptions}
          onRefresh={refresh}
        />
      </div>

      <ImageGallery
        images={images}
        isLoading={isLoadingPage}
        onImageClick={(image, loadedSrc) => {
          setPreviewImage(image);
          setPreviewSrc(loadedSrc);
        }}
        onDelete={deleteImage}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs">Prev</span>
          </button>

          {(() => {
            const pages: (number | '...')[] = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 3) pages.push('...');
              const start = Math.max(2, page - 1);
              const end = Math.min(totalPages - 1, page + 1);
              for (let i = start; i <= end; i++) pages.push(i);
              if (page < totalPages - 2) pages.push('...');
              pages.push(totalPages);
            }
            return pages.map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="flex h-8 w-6 items-center justify-center text-xs text-[var(--text-muted)]">...</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-medium transition-colors ${
                    page === p
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent)]'
                  }`}
                >
                  {p}
                </button>
              )
            );
          })()}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-xs">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs text-[var(--text-muted)]">Page {page} of {totalPages}</span>
        </div>
      )}

      <ImagePreviewModal
        open={!!previewImage}
        onClose={() => {
          setPreviewImage(null);
          setPreviewSrc(undefined);
        }}
        image={previewImage}
        previewSrc={previewSrc}
      />
    </PageTransition>
  );
}
