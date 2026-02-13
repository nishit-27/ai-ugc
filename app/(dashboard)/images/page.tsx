'use client';

import { useState } from 'react';
import type { GeneratedImage } from '@/types';
import { useGeneratedImages } from '@/hooks/useGeneratedImages';
import RefreshButton from '@/components/ui/RefreshButton';
import ImageGallery from '@/components/images/ImageGallery';
import ImagePreviewModal from '@/components/images/ImagePreviewModal';

export default function ImagesPage() {
  const { images, isLoadingPage, refresh, deleteImage } = useGeneratedImages();
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Images</h1>
          <p className="text-[var(--text-muted)]">Generated first-frame images</p>
        </div>
        <RefreshButton onClick={refresh} />
      </div>

      <ImageGallery
        images={images}
        isLoading={isLoadingPage}
        onImageClick={(image) => setPreviewImage(image)}
        onDelete={deleteImage}
      />

      <ImagePreviewModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        image={previewImage}
      />
    </div>
  );
}
