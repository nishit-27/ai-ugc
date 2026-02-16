'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { useJobs } from '@/hooks/useJobs';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { signUrls } from '@/lib/signedUrlClient';
import Spinner from '@/components/ui/Spinner';
import type { Model, ModelImage, GeneratedImage } from '@/types';

export default function SingleVideoForm({
  models,
  modelImages,
  loadModelImages,
}: {
  models: Model[];
  modelImages: ModelImage[];
  loadModelImages: (modelId: string) => Promise<void>;
}) {
  const { showToast } = useToast();
  const { refresh: refreshJobs } = useJobs();
  const { uploadVideo: uploadSourceVideoFn, isUploading: isUploadingSourceVideo, progress: sourceVideoUploadProgress } = useVideoUpload();

  const [tiktokUrl, setTiktokUrl] = useState('');
  const [videoSource, setVideoSource] = useState<'tiktok' | 'upload'>('tiktok');
  const [uploadedSourceVideo, setUploadedSourceVideo] = useState<string | null>(null);
  const [uploadedSourceVideoName, setUploadedSourceVideoName] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [maxSeconds, setMaxSeconds] = useState(10);
  const [generateDisabled, setGenerateDisabled] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Model & image picker state
  const [selectedModelId, setSelectedModelId] = useState('');
  const [imageTab, setImageTab] = useState<'upload' | 'library'>('upload');
  const [libraryImages, setLibraryImages] = useState<GeneratedImage[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  useEffect(() => {
    const hasVideo = videoSource === 'tiktok' ? !!tiktokUrl.trim() : !!uploadedSourceVideo;
    setGenerateDisabled(!hasVideo || !uploadedImagePath);
  }, [tiktokUrl, uploadedImagePath, videoSource, uploadedSourceVideo]);

  // When a model is selected, load its reference images and generated images
  const handleModelSelect = useCallback(async (modelId: string) => {
    setSelectedModelId(modelId);
    if (!modelId) {
      setLibraryImages([]);
      return;
    }
    // Load reference images
    loadModelImages(modelId);
    // Load generated images for this model
    setIsLoadingLibrary(true);
    try {
      const res = await fetch(`/api/generated-images?modelId=${modelId}`);
      const data = await res.json();
      const imgs: GeneratedImage[] = Array.isArray(data.images) ? data.images : [];
      // Sign URLs
      const gcsUrls = imgs.map((img) => img.gcsUrl).filter((url) => url?.includes('storage.googleapis.com'));
      if (gcsUrls.length > 0) {
        const signed = await signUrls(gcsUrls);
        setLibraryImages(imgs.map((img) => ({ ...img, signedUrl: signed.get(img.gcsUrl) || img.gcsUrl })));
      } else {
        setLibraryImages(imgs);
      }
    } catch (e) {
      console.error('Failed to load generated images:', e);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [loadModelImages]);

  const uploadImageFile = async (file: File) => {
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadedImagePath(data.url || data.path);
        showToast('Image uploaded', 'success');
      }
    } catch {
      showToast('Upload failed', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
  };

  const uploadSourceVideoFile = async (file: File) => {
    try {
      const data = await uploadSourceVideoFn(file);
      if (data?.gcsUrl) {
        setUploadedSourceVideo(data.gcsUrl);
        setUploadedSourceVideoName(file.name);
        showToast('Video uploaded!', 'success');
      } else {
        showToast('Upload failed', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Upload error', 'error');
    }
  };

  const handleSourceVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadSourceVideoFile(file);
    e.target.value = '';
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const payload: Record<string, unknown> = {
        imageUrl: uploadedImagePath,
        maxSeconds: maxSeconds,
      };
      if (videoSource === 'upload' && uploadedSourceVideo) {
        payload.videoUrl = uploadedSourceVideo;
      } else {
        payload.tiktokUrl = tiktokUrl.trim();
      }
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setTiktokUrl('');
        setUploadedSourceVideo(null);
        setUploadedSourceVideoName(null);
        refreshJobs();
        showToast('Generation started!', 'success');
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + (err as Error).message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Combine reference images and generated images for library view
  const allLibraryImages: { url: string; gcsUrl: string; label: string }[] = [];
  if (selectedModelId) {
    for (const img of modelImages) {
      allLibraryImages.push({
        url: img.signedUrl || img.gcsUrl,
        gcsUrl: img.gcsUrl,
        label: img.isPrimary ? 'Primary' : 'Reference',
      });
    }
    for (const img of libraryImages) {
      allLibraryImages.push({
        url: img.signedUrl || img.gcsUrl,
        gcsUrl: img.gcsUrl,
        label: 'Generated',
      });
    }
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-4 text-lg font-semibold">Create Video</h3>

        {/* Video Source Toggle */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Video Source</label>
          <div className="flex rounded-lg border border-[var(--border)] p-1">
            <button
              onClick={() => setVideoSource('tiktok')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                videoSource === 'tiktok'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
              }`}
            >
              Paste URL
            </button>
            <button
              onClick={() => setVideoSource('upload')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                videoSource === 'upload'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
              }`}
            >
              Upload Video
            </button>
          </div>
        </div>

        {videoSource === 'tiktok' ? (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Video URL</label>
            <input
              type="text"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              onBlur={() => {
                const url = tiktokUrl.trim();
                if (url && url.startsWith('http') && !(/tiktok\.com/i.test(url)) && !(/instagram\.com\/(p|reel|reels)\//i.test(url))) {
                  showToast('Only TikTok and Instagram URLs are supported', 'error');
                }
              }}
              placeholder="Paste TikTok or Instagram URL..."
              className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Upload Video</label>
            <label
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-transparent py-8 transition-colors ${
                isUploadingSourceVideo
                  ? 'cursor-wait border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'cursor-pointer border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
              }`}
              onDragOver={(e) => {
                if (isUploadingSourceVideo) return;
                e.preventDefault();
                e.currentTarget.classList.add('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
                if (isUploadingSourceVideo) return;
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('video/')) {
                  uploadSourceVideoFile(file);
                } else {
                  showToast('Please drop a video file (MP4, MOV, WebM)', 'error');
                }
              }}
            >
              {isUploadingSourceVideo ? (
                <>
                  <Spinner className="h-10 w-10 text-[var(--primary)]" />
                  <span className="mt-2 text-sm font-medium text-[var(--primary)]">
                    Uploading... {sourceVideoUploadProgress}%
                  </span>
                </>
              ) : uploadedSourceVideo ? (
                <div className="flex flex-col items-center">
                  <svg className="h-10 w-10 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="mt-2 text-sm font-medium text-[var(--text)]">{uploadedSourceVideoName}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUploadedSourceVideo(null);
                      setUploadedSourceVideoName(null);
                    }}
                    className="mt-2 text-xs text-[var(--error)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <svg className="h-10 w-10 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="mt-2 text-sm text-[var(--text-muted)]">Click or drag video here</span>
                  <span className="mt-1 text-xs text-[var(--text-muted)]">MP4, MOV, WebM</span>
                </>
              )}
              <input type="file" accept="video/mp4,video/mov,video/webm,.mp4,.mov,.webm" className="hidden" onChange={handleSourceVideoUpload} disabled={isUploadingSourceVideo} />
            </label>
          </div>
        )}

        {/* Model Selection */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Model</label>
          <select
            value={selectedModelId}
            onChange={(e) => handleModelSelect(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">No model (upload image manually)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Model Image — Upload / Library toggle */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Model Image</label>

          {/* Tab toggle — only show if a model is selected */}
          {selectedModelId && (
            <div className="mb-3 flex rounded-lg border border-[var(--border)] p-1">
              <button
                onClick={() => setImageTab('upload')}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  imageTab === 'upload'
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
                }`}
              >
                Upload
              </button>
              <button
                onClick={() => setImageTab('library')}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  imageTab === 'library'
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
                }`}
              >
                Choose from Library
              </button>
            </div>
          )}

          {/* Upload tab (or when no model selected) */}
          {(imageTab === 'upload' || !selectedModelId) && (
            <label
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-transparent py-8 transition-colors ${
                isUploadingImage
                  ? 'cursor-wait border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'cursor-pointer border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
              }`}
              onDragOver={(e) => {
                if (isUploadingImage) return;
                e.preventDefault();
                e.currentTarget.classList.add('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]', 'scale-[1.01]');
                if (isUploadingImage) return;
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  uploadImageFile(file);
                } else {
                  showToast('Please drop an image file', 'error');
                }
              }}
            >
              {isUploadingImage ? (
                <>
                  <Spinner className="h-10 w-10 text-[var(--primary)]" />
                  <span className="mt-2 text-sm font-medium text-[var(--primary)]">Uploading...</span>
                </>
              ) : uploadedImagePath ? (
                <img src={uploadedImagePath} alt="Uploaded" className="max-h-36 max-w-full rounded-lg object-contain" />
              ) : (
                <span className="text-3xl">+</span>
              )}
              {!isUploadingImage && <span className="mt-2 text-sm text-[var(--text-muted)]">Click or drag image here</span>}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploadingImage} />
            </label>
          )}

          {/* Library tab */}
          {imageTab === 'library' && selectedModelId && (
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-4">
              {isLoadingLibrary ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-8 w-8 text-[var(--primary)]" />
                </div>
              ) : allLibraryImages.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No images found for this model. Upload reference images on the Models page or generate first frames.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {allLibraryImages.map((img) => {
                    const isSelected = uploadedImagePath === img.url || uploadedImagePath === img.gcsUrl;
                    return (
                      <button
                        key={img.gcsUrl}
                        type="button"
                        onClick={() => setUploadedImagePath(img.url)}
                        className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-[var(--primary)] ring-2 ring-[var(--primary)] ring-offset-1'
                            : 'border-transparent hover:border-[var(--primary)]/50'
                        }`}
                      >
                        <img
                          src={img.url}
                          alt={img.label}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
                          {img.label}
                        </span>
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[var(--primary)]/20">
                            <svg className="h-6 w-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Duration */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
            Max Duration: <span>{maxSeconds}</span>s
          </label>
          <input
            type="range"
            min={5}
            max={30}
            value={maxSeconds}
            onChange={(e) => setMaxSeconds(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generateDisabled || isGenerating}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Spinner />
              Starting Generation...
            </>
          ) : (
            'Generate Video'
          )}
        </button>
      </div>
    </div>
  );
}
