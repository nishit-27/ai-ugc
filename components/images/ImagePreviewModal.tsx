'use client';

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

  return (
    <Modal open={open} onClose={onClose} title="Image Preview" maxWidth="max-w-2xl">
      <div className="p-4">
        <img
          src={image.signedUrl || image.gcsUrl}
          alt={image.filename}
          className="w-full rounded-lg"
        />
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
