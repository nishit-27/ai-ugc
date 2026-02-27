'use client';

import Modal from '@/components/ui/Modal';
import LoadingShimmer from '@/components/ui/LoadingShimmer';
import type { GeneratedImage } from '@/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ImagePreviewModal({
  open,
  onClose,
  image,
  previewSrc,
}: {
  open: boolean;
  onClose: () => void;
  image: GeneratedImage | null;
  previewSrc?: string;
}) {
  if (!image) return null;
  const displayUrl = image.signedUrl || image.gcsUrl || '';
  const src = previewSrc || displayUrl;

  return (
    <Modal open={open} onClose={onClose} title="Image Preview" maxWidth="max-w-2xl">
      <div className="p-4">
        <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: '3/4' }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={image.filename}
              className="h-full w-full object-contain"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="relative h-full w-full overflow-hidden bg-[var(--accent)]">
              <LoadingShimmer />
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1 text-sm text-[var(--text-muted)]">
          <p>
            <span className="font-medium text-[var(--text)]">Created:</span>{' '}
            {formatDate(image.createdAt)}
          </p>
          {image.promptVariant && (
            <p>
              <span className="font-medium text-[var(--text)]">Variant:</span>{' '}
              Prompt {image.promptVariant}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
