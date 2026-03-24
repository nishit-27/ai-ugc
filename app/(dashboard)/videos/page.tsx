'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGeneratedVideos, type GeneratedVideo } from '@/hooks/useGeneratedVideos';
import { useModelFilterOptions } from '@/hooks/useModelFilterOptions';
import VideoGallery from '@/components/videos/VideoGallery';
import VideoPreviewModal from '@/components/videos/VideoPreviewModal';
import ModelDateToolbar from '@/components/media/ModelDateToolbar';
import type { DateFilterValue } from '@/types/media-filters';
import PageTransition from '@/components/ui/PageTransition';

export default function VideosPage() {
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('newest');
  const { models: modelOptions } = useModelFilterOptions();
  const { videos, isLoadingPage, refresh, page, setPage, totalPages, total } = useGeneratedVideos({
    modelId: modelFilter === 'all' ? undefined : modelFilter,
    dateFilter,
  });
  const [previewVideo, setPreviewVideo] = useState<GeneratedVideo | null>(null);

  return (
    <PageTransition>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Videos</h1>
          <p className="text-[var(--text-muted)]">
            Generated videos{total > 0 && <span className="ml-1">({total})</span>}
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

      <VideoGallery
        videos={videos}
        isLoading={isLoadingPage}
        onVideoClick={(video) => setPreviewVideo(video)}
      />

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
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
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-xs">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs text-[var(--text-muted)]">Page {page} of {totalPages}</span>
        </div>
      )}

      <VideoPreviewModal
        open={!!previewVideo}
        onClose={() => setPreviewVideo(null)}
        video={previewVideo}
      />
    </PageTransition>
  );
}
