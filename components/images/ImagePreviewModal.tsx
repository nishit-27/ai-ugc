'use client';

import Image from 'next/image';
import Modal from '@/components/ui/Modal';
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
}: {
  open: boolean;
  onClose: () => void;
  image: GeneratedImage | null;
}) {
  if (!image) return null;
  const displayUrl = image.signedUrl
    || (image.gcsUrl && !image.gcsUrl.includes('storage.googleapis.com') ? image.gcsUrl : '');

  return (
    <Modal open={open} onClose={onClose} title="Image Preview" maxWidth="max-w-2xl">
      <div className="p-4">
        <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: '3/4' }}>
          {displayUrl ? (
            <Image
              src={displayUrl}
              alt={image.filename}
              fill
              quality={85}
              sizes="(max-width: 768px) 92vw, 42rem"
              className="object-contain"
            />
          ) : (
            <div className="relative h-full w-full overflow-hidden bg-[var(--accent)]">
              <div className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20 animate-[shimmer_1.3s_linear_infinite]" />
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
