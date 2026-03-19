import { Expand } from 'lucide-react';
import type { GeneratedImage } from '@/types';

type Props = {
  showLibrary: boolean;
  isLoadingLibrary: boolean;
  libraryImages: GeneratedImage[];
  modelId?: string;
  selectedImageUrl?: string;
  onSelect: (img: GeneratedImage) => void;
  setPreviewUrl: (url: string | null) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

export default function VideoGenLibraryChooser({
  showLibrary,
  isLoadingLibrary,
  libraryImages,
  modelId,
  selectedImageUrl,
  onSelect,
  setPreviewUrl,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: Props) {
  if (!showLibrary) return null;

  return (
    <div className="rounded-xl bg-[var(--background)] p-2.5 space-y-2 border border-[var(--border)]">
      {isLoadingLibrary ? (
        <div className="flex items-center justify-center py-6">
          <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin" />
        </div>
      ) : libraryImages.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6">
          <p className="text-xs text-[var(--text-muted)]">No previous generations found</p>
          {modelId && <p className="text-[10px] text-[var(--text-muted)]">Generate first frames to build your library</p>}
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-[var(--text-muted)]">
            {libraryImages.length} previous generation{libraryImages.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
            {libraryImages.map((img) => {
              const displayUrl = img.signedUrl || img.gcsUrl;
              const isSelected = selectedImageUrl === img.gcsUrl;
              return (
                <button
                  key={img.id}
                  onClick={() => onSelect(img)}
                  className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all duration-150 ${
                    isSelected
                      ? 'border-[var(--primary)] shadow-md'
                      : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                  }`}
                >
                  <img src={displayUrl} alt={img.filename} className="h-full w-full object-cover" />
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewUrl(displayUrl);
                    }}
                    className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                  >
                    <Expand className="h-2.5 w-2.5" />
                  </div>
                  {isSelected && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[var(--primary)]/90 to-transparent py-1 text-center">
                      <span className="text-[10px] font-semibold text-[var(--primary-foreground)]">Selected as first frame</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full rounded-lg bg-[var(--accent)] px-2.5 py-2 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-border)]/30 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load More'
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
