'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, RotateCcw, Check, ImageIcon, Sparkles, RefreshCw } from 'lucide-react';
import { signUrls } from '@/lib/signedUrlClient';
import LoadingShimmer from '@/components/ui/LoadingShimmer';
import type { TemplateJob, ModelImage, MasterConfigModel, VideoGenConfig } from '@/types';

type ExtractedFrame = {
  url: string;
  gcsUrl: string;
  score: number;
  hasFace: boolean;
  timestamp: number;
};

type FirstFrameOption = {
  url: string;
  gcsUrl: string;
};

export default function RegenerateModal({
  job,
  modelInfo,
  onClose,
  onRegenerate,
}: {
  job: TemplateJob;
  modelInfo?: MasterConfigModel;
  onClose: () => void;
  onRegenerate: (jobId: string, overrides?: { imageUrl?: string; imageId?: string }) => void;
}) {
  // Model images
  const [images, setImages] = useState<ModelImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // First frame state
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedFrameUrl, setSelectedFrameUrl] = useState<string | null>(null);
  const [firstFrameOptions, setFirstFrameOptions] = useState<FirstFrameOption[]>([]);
  const [isGeneratingFirstFrame, setIsGeneratingFirstFrame] = useState(false);
  const [selectedFirstFrame, setSelectedFirstFrame] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Resolve source video URL (sign GCS URLs so extract-frames API can download)
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Always use the raw videoUrl — job.signedUrl may be expired and
    // passing an already-signed URL to signUrls produces a bad path (404).
    const rawUrl = job.videoUrl;
    if (!rawUrl) return;

    if (rawUrl.includes('storage.googleapis.com')) {
      signUrls([rawUrl]).then((signed) => {
        setResolvedVideoUrl(signed.get(rawUrl) || rawUrl);
      }).catch(() => {
        setResolvedVideoUrl(rawUrl);
      });
    } else {
      setResolvedVideoUrl(rawUrl);
    }
  }, [job.videoUrl]);

  // Get current pipeline config
  const videoGenStep = job.pipeline.find((s) => s.type === 'video-generation');
  const videoGenConfig = videoGenStep?.config as VideoGenConfig | undefined;

  // Fetch model images
  useEffect(() => {
    if (!job.modelId) {
      setLoadingImages(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/models/${job.modelId}/images`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data: ModelImage[] = await res.json();
        if (!mounted) return;
        setImages(data);

        // Sign GCS URLs
        const gcsUrls = data
          .map((img) => img.gcsUrl)
          .filter((u) => u?.includes('storage.googleapis.com'));
        if (gcsUrls.length > 0) {
          try {
            const signRes = await fetch('/api/signed-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: gcsUrls }),
            });
            if (signRes.ok) {
              const signData = await signRes.json();
              if (mounted) setSignedUrls(signData.signed || {});
            }
          } catch {}
        }
      } catch {}
      finally {
        if (mounted) setLoadingImages(false);
      }
    })();
    return () => { mounted = false; };
  }, [job.modelId]);

  // Find current image used in the pipeline
  const currentImageUrl = videoGenConfig?.imageUrl || undefined;
  const currentImageId = videoGenConfig?.imageId || undefined;

  const isCurrentImage = (img: ModelImage) => {
    if (currentImageId && img.id === currentImageId) return true;
    if (currentImageUrl && img.gcsUrl === currentImageUrl) return true;
    if (!currentImageId && !currentImageUrl && img.isPrimary) return true;
    return false;
  };

  // Resolve the model image URL for first frame generation
  const getModelImageForFirstFrame = (): string | null => {
    if (selectedImageId) {
      const img = images.find((i) => i.id === selectedImageId);
      return img?.gcsUrl || null;
    }
    if (currentImageId) {
      const img = images.find((i) => i.id === currentImageId);
      return img?.gcsUrl || null;
    }
    return currentImageUrl || modelInfo?.primaryImageUrl || null;
  };

  // Extract frames from source video
  const handleExtractFrames = async () => {
    if (!resolvedVideoUrl) return;
    setIsExtracting(true);
    setExtractedFrames([]);
    setSelectedFrameUrl(null);
    setFirstFrameOptions([]);
    setSelectedFirstFrame(null);
    setGenerateError(null);
    try {
      const res = await fetch('/api/extract-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: resolvedVideoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract frames');
      const frames: ExtractedFrame[] = data.frames || [];
      setExtractedFrames(frames);
      if (frames.length > 0) {
        setSelectedFrameUrl(frames[0].gcsUrl);
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to extract frames');
    } finally {
      setIsExtracting(false);
    }
  };

  // Generate first frame (face-swap)
  const handleGenerateFirstFrame = async () => {
    const modelImageUrl = getModelImageForFirstFrame();
    if (!modelImageUrl || !selectedFrameUrl) return;

    setIsGeneratingFirstFrame(true);
    setGenerateError(null);
    setFirstFrameOptions([]);
    setSelectedFirstFrame(null);
    try {
      const res = await fetch('/api/generate-first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelImageUrl,
          frameImageUrl: selectedFrameUrl,
          resolution: videoGenConfig?.firstFrameResolution || '1K',
          modelId: job.modelId || modelInfo?.modelId || null,
          provider: videoGenConfig?.firstFrameProvider || 'gemini',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate first frame');
      setFirstFrameOptions(data.images || []);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to generate first frame');
    } finally {
      setIsGeneratingFirstFrame(false);
    }
  };

  const handleRegenerate = async () => {
    setSubmitting(true);
    try {
      if (selectedFirstFrame) {
        onRegenerate(job.id, { imageUrl: selectedFirstFrame });
        return;
      }
      if (selectedImageId) {
        const img = images.find((i) => i.id === selectedImageId);
        if (img) {
          onRegenerate(job.id, { imageUrl: img.gcsUrl, imageId: img.id });
          return;
        }
      }
      onRegenerate(job.id);
    } finally {
      setSubmitting(false);
    }
  };

  const hasChanges = !!selectedImageId || !!selectedFirstFrame;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-2xl border border-[var(--border)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-master-light">
              <RotateCcw className="h-4 w-4 text-master dark:text-master-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Edit & Regenerate</h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                {modelInfo?.modelName || job.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--accent)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Section 1: Model Image ── */}
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <ImageIcon className="h-3.5 w-3.5" />
              Model Image
            </label>

            {loadingImages ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : images.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">No model images found</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {images.map((img) => {
                  const isCurrent = isCurrentImage(img);
                  const isSelected = selectedImageId === img.id;
                  const displayUrl = signedUrls[img.gcsUrl] || img.gcsUrl;

                  return (
                    <button
                      key={img.id}
                      onClick={() => {
                        if (isCurrent && !selectedImageId) return;
                        setSelectedImageId(isSelected ? null : img.id);
                        setFirstFrameOptions([]);
                        setSelectedFirstFrame(null);
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-master ring-2 ring-master/20 dark:border-master-foreground dark:ring-master-foreground/20'
                          : isCurrent && !selectedImageId
                          ? 'border-emerald-400 ring-1 ring-emerald-400/20'
                          : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <img src={displayUrl} alt="" className="h-full w-full object-cover" />
                      {isCurrent && !selectedImageId && (
                        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent pb-1">
                          <span className="text-[8px] font-semibold text-white">Current</span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-master dark:bg-master-foreground">
                            <Check className="h-3 w-3 text-white dark:text-master" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section 2: First Frame Generation ── */}
          {resolvedVideoUrl && (
            <div className="rounded-xl bg-gradient-to-b from-master-light/50 to-[var(--background)] overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-master">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--text)]">First Frame</p>
                  <p className="text-[10px] text-[var(--text-muted)]">AI face swap onto a video scene</p>
                </div>
              </div>

              <div className="px-4 pb-4 space-y-3">
                {/* Error message — always visible */}
                {generateError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {generateError}
                  </div>
                )}

                {/* Extract frames button / frame grid */}
                {extractedFrames.length === 0 && !isExtracting ? (
                  <button
                    onClick={handleExtractFrames}
                    className="w-full rounded-lg bg-master-light px-3 py-2.5 text-xs font-medium text-master dark:text-master-muted transition-colors hover:opacity-80"
                  >
                    Extract frames from video
                  </button>
                ) : isExtracting ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                    <span className="text-xs text-[var(--text-muted)]">Extracting frames...</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Pick a scene frame</p>
                      <button
                        onClick={handleExtractFrames}
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        Re-extract
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {extractedFrames.map((frame, i) => {
                        const isSel = selectedFrameUrl === frame.gcsUrl;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedFrameUrl(frame.gcsUrl);
                              setFirstFrameOptions([]);
                              setSelectedFirstFrame(null);
                              setGenerateError(null);
                            }}
                            className={`group relative aspect-square overflow-hidden rounded-lg transition-all ${
                              isSel ? 'ring-2 ring-master ring-offset-1' : 'hover:opacity-80'
                            }`}
                          >
                            <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
                            {frame.hasFace && (
                              <div className="absolute left-0.5 top-0.5 rounded-md bg-green-500/80 px-1 py-0.5 text-[7px] font-bold text-white">
                                {frame.score}
                              </div>
                            )}
                            {isSel && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Generate first frame button */}
                    {selectedFrameUrl && getModelImageForFirstFrame() && !isGeneratingFirstFrame && (
                      <button
                        onClick={handleGenerateFirstFrame}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-master px-4 py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                      >
                        {firstFrameOptions.length > 0 ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Regenerate First Frame
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate First Frame
                          </>
                        )}
                      </button>
                    )}

                    {/* Loading skeleton while generating */}
                    {isGeneratingFirstFrame && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)]">Generating options...</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[0, 1].map((i) => (
                            <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-br from-master-light to-[var(--background)]">
                              <LoadingShimmer tone="master" backgroundClassName="bg-gradient-to-br from-master-light to-[var(--background)]" />
                              <div className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[9px] font-bold text-white">
                                {String.fromCharCode(65 + i)}
                              </div>
                              <div className="absolute bottom-0 inset-x-0 flex items-center justify-center pb-3 pt-6 bg-gradient-to-t from-master/10 to-transparent">
                                <span className="h-4 w-4 rounded-full border-2 border-master/20 border-t-master animate-spin" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generated results */}
                    {!isGeneratingFirstFrame && firstFrameOptions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a result</p>
                        <div className="grid grid-cols-2 gap-2">
                          {firstFrameOptions.map((opt, i) => {
                            const isSel = selectedFirstFrame === opt.gcsUrl;
                            return (
                              <button
                                key={i}
                                onClick={() => setSelectedFirstFrame(isSel ? null : opt.gcsUrl)}
                                className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all ${
                                  isSel ? 'border-master shadow-md' : 'border-[var(--border)] hover:border-master-muted'
                                }`}
                              >
                                <img src={opt.url} alt={`Option ${String.fromCharCode(65 + i)}`} className="h-full w-full object-cover" />
                                <div className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[9px] font-bold text-white backdrop-blur-sm">
                                  {String.fromCharCode(65 + i)}
                                </div>
                                {isSel && (
                                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-master/90 to-transparent py-1 text-center">
                                    <span className="text-[10px] font-semibold text-white">Selected</span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            onClick={handleRegenerate}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-master px-4 py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {hasChanges ? 'Regenerate with Changes' : 'Regenerate'}
          </button>
        </div>
      </div>
    </div>
  );
}
