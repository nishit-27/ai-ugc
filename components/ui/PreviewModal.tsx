'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function PreviewModal({
  src,
  type = 'image',
  onClose,
}: {
  src: string;
  type?: 'image' | 'video';
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        {type === 'video' ? (
          <video
            src={src}
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={src}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}
