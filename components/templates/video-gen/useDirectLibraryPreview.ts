import { useEffect } from 'react';
import type { GeneratedImage } from '@/types';

type Params = {
  isDirectLibraryFirstFrame: boolean;
  imageUrl?: string;
  libraryImages: GeneratedImage[];
  selectedFirstFrameDisplayUrl: string | null;
  setSelectedFirstFrameDisplayUrl: (url: string | null) => void;
  setIsResolvingSelectedFirstFrame: (value: boolean) => void;
};

export function useDirectLibraryPreview({
  isDirectLibraryFirstFrame,
  imageUrl,
  libraryImages,
  selectedFirstFrameDisplayUrl,
  setSelectedFirstFrameDisplayUrl,
  setIsResolvingSelectedFirstFrame,
}: Params) {
  useEffect(() => {
    if (!isDirectLibraryFirstFrame || !imageUrl) {
      setIsResolvingSelectedFirstFrame(false);
      return;
    }

    // Try to find in library first
    const matched = libraryImages.find((img) => img.gcsUrl === imageUrl);
    const resolved = matched?.signedUrl || matched?.gcsUrl || imageUrl;

    if (selectedFirstFrameDisplayUrl !== resolved) {
      setSelectedFirstFrameDisplayUrl(resolved);
    }
    setIsResolvingSelectedFirstFrame(false);
  }, [
    imageUrl,
    isDirectLibraryFirstFrame,
    libraryImages,
    selectedFirstFrameDisplayUrl,
    setIsResolvingSelectedFirstFrame,
    setSelectedFirstFrameDisplayUrl,
  ]);
}
