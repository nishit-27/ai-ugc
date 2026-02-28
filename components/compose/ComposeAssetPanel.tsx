'use client';

import { useState, useRef } from 'react';
import { Film, ImageIcon, UserCircle, Upload, Link2, Layers, Type, Music, Scissors, Briefcase, ChevronRight } from 'lucide-react';
import type { LayerSource, StepResult, Model } from '@/types';

type Tab = 'pipeline' | 'videos' | 'images' | 'models' | 'jobs' | 'upload' | 'url';

type VideoItem = { url: string; gcsUrl: string; name: string };
type ImageItem = { url: string; gcsUrl: string; name: string };
type ModelItem = { id: string; name: string; avatarUrl?: string; images: { gcsUrl: string; signedUrl?: string; filename: string }[] };

type JobBatchItem = {
  id: string;
  name?: string;
  status?: string;
  isMaster?: boolean;
  totalJobs?: number;
  completedJobs?: number;
  createdAt?: string;
};

type ExpandedJob = {
  id: string;
  name?: string;
  status?: string;
  outputUrl?: string;
  signedUrl?: string;
};

const VIDEOS_PER_PAGE = 40;
const IMAGES_PER_PAGE = 40;

type PipelineStepSource = {
  stepId: string;
  type: string;
  label: string;
  previewUrl?: string;
  modelRefs?: { modelId: string; modelName: string; imageUrl: string; firstFrameUrl?: string; videoUrl?: string }[];
  batchImages?: { imageUrl: string; filename?: string; imageId?: string }[];
};

type ComposeAssetPanelProps = {
  mode: 'pipeline' | 'standalone';
  onAddLayer: (source: LayerSource, type: 'video' | 'image') => void;
  stepResults?: StepResult[];
  pipelineSteps?: PipelineStepSource[];
};

export default function ComposeAssetPanel({
  mode,
  onAddLayer,
  stepResults,
  pipelineSteps,
}: ComposeAssetPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>(mode === 'pipeline' ? 'pipeline' : 'videos');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingModelImages, setIsLoadingModelImages] = useState(false);
  const [modelGenImages, setModelGenImages] = useState<Map<string, ImageItem[]>>(new Map());
  const [modelGenVideos, setModelGenVideos] = useState<Map<string, VideoItem[]>>(new Map());
  const [isLoadingModelGenContent, setIsLoadingModelGenContent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobBatches, setJobBatches] = useState<JobBatchItem[]>([]);
  const [standaloneJobs, setStandaloneJobs] = useState<{ id: string; name?: string; outputUrl?: string }[]>([]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedBatchJobs, setExpandedBatchJobs] = useState<ExpandedJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingBatchJobs, setIsLoadingBatchJobs] = useState(false);
  const videosLoaded = useRef(false);
  const imagesLoaded = useRef(false);
  const modelsLoaded = useRef(false);
  const jobsLoaded = useRef(false);

  const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
    ...(mode === 'pipeline' ? [{ id: 'pipeline' as Tab, label: 'Pipeline', icon: Layers }] : []),
    { id: 'videos', label: 'Videos', icon: Film },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'models', label: 'Models', icon: UserCircle },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'url', label: 'URL', icon: Link2 },
  ];

  const [hasMoreVideos, setHasMoreVideos] = useState(false);
  const [hasMoreImages, setHasMoreImages] = useState(false);
  const [isLoadingMoreVideos, setIsLoadingMoreVideos] = useState(false);
  const [isLoadingMoreImages, setIsLoadingMoreImages] = useState(false);
  const videosPageRef = useRef(1);
  const imagesPageRef = useRef(1);

  const loadVideos = async (loadMore = false) => {
    if (!loadMore && (videosLoaded.current || isLoadingVideos)) return;
    if (loadMore) {
      setIsLoadingMoreVideos(true);
    } else {
      setIsLoadingVideos(true);
      videosLoaded.current = true;
      videosPageRef.current = 1;
    }
    try {
      const res = await fetch('/api/videos?mode=generated');
      const data = await res.json();
      const rawVideos = data.videos;
      if (!Array.isArray(rawVideos)) return;

      const page = videosPageRef.current;
      const start = loadMore ? (page - 1) * VIDEOS_PER_PAGE : 0;
      const end = page * VIDEOS_PER_PAGE;
      const pageVideos = rawVideos.slice(start, end);

      const items: VideoItem[] = pageVideos.map((v: { url?: string; path?: string; name?: string }) => {
        const gcsUrl = v.url || v.path || '';
        return {
          gcsUrl,
          url: gcsUrl,
          name: v.name || 'Video',
        };
      });

      if (loadMore) {
        setVideos((prev) => [...prev, ...items]);
      } else {
        setVideos(items);
      }
      setHasMoreVideos(rawVideos.length > end);
      videosPageRef.current = page + 1;
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setIsLoadingVideos(false);
      setIsLoadingMoreVideos(false);
    }
  };

  const loadImages = async (loadMore = false) => {
    if (!loadMore && (imagesLoaded.current || isLoadingImages)) return;
    if (loadMore) {
      setIsLoadingMoreImages(true);
    } else {
      setIsLoadingImages(true);
      imagesLoaded.current = true;
      imagesPageRef.current = 1;
    }
    try {
      const page = imagesPageRef.current;
      // Request signed URLs from the API so images actually display
      const res = await fetch(`/api/generated-images?page=${page}&limit=${IMAGES_PER_PAGE}&signed=true`);
      const data = await res.json();
      const rawImages = data.images;
      if (!Array.isArray(rawImages)) return;

      const items: ImageItem[] = rawImages.map((img: { gcsUrl?: string; signedUrl?: string; filename?: string }) => {
        const gcsUrl = img.gcsUrl || '';
        return {
          gcsUrl,
          url: img.signedUrl || gcsUrl,
          name: img.filename || 'Image',
        };
      });

      if (loadMore) {
        setImages((prev) => [...prev, ...items]);
      } else {
        setImages(items);
      }
      const total = data.total ?? 0;
      setHasMoreImages(page * IMAGES_PER_PAGE < total);
      imagesPageRef.current = page + 1;
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setIsLoadingImages(false);
      setIsLoadingMoreImages(false);
    }
  };

  const loadModels = async () => {
    if (modelsLoaded.current || isLoadingModels) return;
    setIsLoadingModels(true);
    modelsLoaded.current = true;
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const rawModels: Model[] = Array.isArray(data) ? data : [];

      setModels(rawModels.map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl || undefined,
        images: [],
      })));
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadModelImages = async (modelId: string) => {
    setIsLoadingModelImages(true);
    try {
      const res = await fetch(`/api/models/${modelId}/images`);
      const data = await res.json();
      const rawImages: { gcsUrl: string; signedUrl?: string; filename: string }[] = Array.isArray(data) ? data : [];

      const withSigned = rawImages.map((img) => ({
        ...img,
        signedUrl: img.signedUrl || img.gcsUrl,
      }));

      setModels((prev) => prev.map((m) =>
        m.id === modelId ? { ...m, images: withSigned } : m
      ));
    } catch (err) {
      console.error('Failed to load model images:', err);
    } finally {
      setIsLoadingModelImages(false);
    }
  };

  const loadModelGenContent = async (modelId: string) => {
    if (modelGenImages.has(modelId)) return; // already loaded
    setIsLoadingModelGenContent(true);
    try {
      const [imgRes, vidRes] = await Promise.all([
        fetch(`/api/generated-images?modelId=${modelId}&limit=20&signed=true`),
        fetch('/api/videos?mode=generated'),
      ]);
      const imgData = await imgRes.json();
      const vidData = await vidRes.json();

      // Generated images
      const rawImgs = Array.isArray(imgData.images) ? imgData.images : [];
      const genImgs: ImageItem[] = rawImgs.map((img: { gcsUrl?: string; signedUrl?: string; filename?: string }) => ({
        gcsUrl: img.gcsUrl || '',
        url: img.signedUrl || img.gcsUrl || '',
        name: img.filename || 'Generated Image',
      }));
      setModelGenImages((prev) => new Map(prev).set(modelId, genImgs));

      // Generated videos — filter by modelId client-side
      const rawVids = Array.isArray(vidData.videos) ? vidData.videos : [];
      const genVids: VideoItem[] = rawVids
        .filter((v: { modelId?: string }) => v.modelId === modelId)
        .slice(0, 20)
        .map((v: { url?: string; path?: string; name?: string }) => ({
          gcsUrl: v.url || v.path || '',
          url: v.url || v.path || '',
          name: v.name || 'Generated Video',
        }));
      setModelGenVideos((prev) => new Map(prev).set(modelId, genVids));
    } catch (err) {
      console.error('Failed to load model generated content:', err);
    } finally {
      setIsLoadingModelGenContent(false);
    }
  };

  const loadJobs = async () => {
    if (jobsLoaded.current || isLoadingJobs) return;
    setIsLoadingJobs(true);
    jobsLoaded.current = true;
    try {
      const res = await fetch('/api/compose-jobs');
      const data = await res.json();
      if (Array.isArray(data.batches)) setJobBatches(data.batches);
      if (Array.isArray(data.standaloneJobs)) setStandaloneJobs(data.standaloneJobs);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const expandBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }
    setExpandedBatchId(batchId);
    setIsLoadingBatchJobs(true);
    setExpandedBatchJobs([]);
    try {
      const res = await fetch(`/api/pipeline-batches/${batchId}`);
      const data = await res.json();
      if (Array.isArray(data.jobs)) {
        setExpandedBatchJobs(data.jobs);
      }
    } catch (err) {
      console.error('Failed to load batch jobs:', err);
    } finally {
      setIsLoadingBatchJobs(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'videos') loadVideos();
    if (tab === 'images') loadImages();
    if (tab === 'models') loadModels();
    if (tab === 'jobs') loadJobs();
  };

  const handleModelExpand = (modelId: string) => {
    if (expandedModelId === modelId) {
      setExpandedModelId(null);
      return;
    }
    setExpandedModelId(modelId);
    const model = models.find((m) => m.id === modelId);
    if (model && model.images.length === 0) {
      loadModelImages(modelId);
    }
    loadModelGenContent(modelId);
  };

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const isVideo = file.type.startsWith('video/');
      const formData = new FormData();
      formData.append(isVideo ? 'video' : 'image', file);
      const endpoint = isVideo ? '/api/upload-video' : '/api/upload-image';
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      if (data.url || data.gcsUrl) {
        const displayUrl = data.url || data.gcsUrl;
        const gcsUrl = data.gcsUrl || data.url;
        onAddLayer(
          { type: 'upload', url: displayUrl, gcsUrl, label: file.name },
          isVideo ? 'video' : 'image',
        );
        setUploadError(null);
      } else {
        setUploadError('Upload succeeded but no URL returned');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUrlAdd = () => {
    if (!urlInput.trim()) return;
    const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(urlInput);
    onAddLayer(
      { type: 'url', url: urlInput.trim(), label: 'URL media' },
      isVideo ? 'video' : 'image',
    );
    setUrlInput('');
  };

  return (
    <div className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap gap-0.5 border-b border-[var(--border)] px-2 pt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1 rounded-t-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--background)] text-[var(--text)] border-b-2 border-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'pipeline' && (
          <div className="space-y-2">
            {stepResults && stepResults.length > 0 && stepResults.map((sr) => (
              <button
                key={sr.stepId}
                onClick={() => onAddLayer(
                  { type: 'step-output', url: sr.signedUrl || sr.outputUrl, gcsUrl: sr.outputUrl, stepId: sr.stepId, label: sr.label },
                  'video',
                )}
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
              >
                <Film className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[var(--text)]">{sr.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Step output</div>
                </div>
              </button>
            ))}
            {pipelineSteps && pipelineSteps.length > 0 && pipelineSteps.map((ps) => {
              // Map step type to icon
              const StepIcon = ps.type === 'text-overlay' ? Type
                : ps.type === 'bg-music' ? Music
                : ps.type === 'attach-video' ? Scissors
                : ps.type === 'video-source' ? Film
                : Film;
              // Map step type to subtitle
              const stepSubtitle = ps.type === 'text-overlay' ? 'Will apply text overlay'
                : ps.type === 'bg-music' ? 'Will add background music'
                : ps.type === 'attach-video' ? 'Will attach video clip'
                : ps.type === 'video-source' ? 'Selected from library'
                : 'Will be generated on run';
              const isVideoStep = ps.type === 'video-generation' || ps.type === 'batch-video-generation' || ps.type === 'attach-video' || ps.type === 'video-source';

              return (
              <div key={ps.stepId} className="space-y-1.5">
                {/* Main step-output button */}
                <button
                  onClick={() => {
                    if (isVideoStep) {
                      onAddLayer(
                        { type: 'step-output', url: ps.previewUrl || '', stepId: ps.stepId, label: ps.label },
                        'video',
                      );
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg border border-dashed p-2 text-left transition-colors ${
                    isVideoStep
                      ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 cursor-pointer'
                      : 'border-[var(--border)] bg-[var(--accent)]/30 cursor-default'
                  }`}
                >
                  {ps.previewUrl ? (
                    <img src={ps.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]">
                      <StepIcon className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-[var(--text)]">{ps.label}</div>
                    <div className={`text-[10px] ${isVideoStep ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>{stepSubtitle}</div>
                  </div>
                </button>

                {/* Batch images: show each image individually with its own add button */}
                {ps.batchImages && ps.batchImages.length > 1 && (
                  <div className="ml-1 pl-2 border-l-2 border-[var(--primary)]/20">
                    <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1">
                      {ps.batchImages.length} source image{ps.batchImages.length !== 1 ? 's' : ''} — each generates a video
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {ps.batchImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => onAddLayer(
                            { type: 'step-output', url: img.imageUrl, stepId: ps.stepId, label: img.filename || `Batch #${idx + 1}` },
                            'video',
                          )}
                          className="group relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] transition-colors hover:border-[var(--primary)]"
                          title={img.filename || `Batch image ${idx + 1}`}
                        >
                          {img.imageUrl ? (
                            <img
                              src={img.imageUrl}
                              alt={img.filename || `Batch ${idx + 1}`}
                              className="aspect-square w-full object-cover"
                                                         />
                          ) : (
                            <div className="flex aspect-square w-full items-center justify-center bg-[var(--accent)]">
                              <ImageIcon className="h-3 w-3 text-[var(--text-muted)]" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-0.5 py-0.5">
                            <span className="block truncate text-[8px] text-white leading-tight">
                              {img.filename || `#${idx + 1}`}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Master mode: show ONE sample Video + First Frame (applies to all models) */}
                {ps.modelRefs && ps.modelRefs.length > 0 && (() => {
                  const sample = ps.modelRefs[0];
                  const hasVideoUrl = !!sample.videoUrl;
                  const videoSrc = sample.videoUrl || sample.firstFrameUrl || sample.imageUrl;
                  const imageSrc = sample.firstFrameUrl || sample.imageUrl;
                  const modelCount = ps.modelRefs.length;
                  return (
                  <div className="ml-1 pl-2 border-l-2 border-[var(--primary)]/20 space-y-1.5">
                    <div className="rounded-md bg-[var(--primary)]/5 border border-[var(--primary)]/20 px-2 py-1.5">
                      <div className="text-[10px] font-medium text-[var(--primary)]">
                        Applies to all {modelCount} model{modelCount !== 1 ? 's' : ''}
                      </div>
                      <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                        Same layout — {modelCount} video{modelCount !== 1 ? 's' : ''} will be generated
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {/* Video layer (sample) */}
                      <button
                        onClick={() => onAddLayer(
                          { type: 'step-output', url: videoSrc, stepId: ps.stepId, modelId: sample.modelId, label: 'Pipeline Video' },
                          'video',
                        )}
                        className="group relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] transition-colors hover:border-[var(--primary)]"
                        title="Add video layer (sample preview)"
                      >
                        {hasVideoUrl ? (
                          <video
                            src={sample.videoUrl}
                            className="aspect-[9/16] w-full object-cover"
                            muted
                            preload="metadata"
                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                          />
                        ) : (
                          <img
                            src={imageSrc}
                            alt="Sample video"
                            className="aspect-[9/16] w-full object-cover"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                          <span className="flex items-center gap-0.5 text-[8px] text-white leading-tight">
                            <Film className="h-2 w-2 shrink-0" /> Video
                          </span>
                        </div>
                      </button>
                      {/* First Frame image layer (sample) */}
                      <button
                        onClick={() => onAddLayer(
                          { type: 'step-output', url: imageSrc, stepId: ps.stepId, modelId: sample.modelId, label: 'Pipeline First Frame' },
                          'image',
                        )}
                        className="group relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] transition-colors hover:border-[var(--primary)]"
                        title="Add first frame layer (sample preview)"
                      >
                        {hasVideoUrl ? (
                          <video
                            src={sample.videoUrl}
                            className="aspect-[9/16] w-full object-cover"
                            muted
                            preload="metadata"
                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                          />
                        ) : (
                          <img
                            src={imageSrc}
                            alt="Sample first frame"
                            className="aspect-[9/16] w-full object-cover"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                          <span className="flex items-center gap-0.5 text-[8px] text-white leading-tight">
                            <ImageIcon className="h-2 w-2 shrink-0" /> First Frame
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
            })}
            {(!stepResults || stepResults.length === 0) && (!pipelineSteps || pipelineSteps.length === 0) && (
              <p className="text-xs text-[var(--text-muted)]">Add a Video Generation step before Compose, or select library videos in the Video Source node.</p>
            )}
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="space-y-2">
            {isLoadingVideos ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              </div>
            ) : videos.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No videos found.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {videos.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => onAddLayer(
                        { type: 'gallery-video', url: v.url, gcsUrl: v.gcsUrl, label: v.name },
                        'video',
                      )}
                      className="group relative overflow-hidden rounded-lg border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                    >
                      <video src={v.url} className="aspect-video w-full object-cover" muted preload="metadata" onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }} />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                        <Film className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
                {hasMoreVideos && (
                  <button
                    onClick={() => loadVideos(true)}
                    disabled={isLoadingMoreVideos}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
                  >
                    {isLoadingMoreVideos ? 'Loading...' : 'Load More Videos'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-2">
            {isLoadingImages ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              </div>
            ) : images.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No images found.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => onAddLayer(
                        { type: 'gallery-image', url: img.url, gcsUrl: img.gcsUrl, label: img.name },
                        'image',
                      )}
                      className="group relative overflow-hidden rounded-lg border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                    >
                      <img src={img.url} alt={img.name} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
                {hasMoreImages && (
                  <button
                    onClick={() => loadImages(true)}
                    disabled={isLoadingMoreImages}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
                  >
                    {isLoadingMoreImages ? 'Loading...' : 'Load More Images'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'models' && (
          <div className="space-y-2">
            {isLoadingModels ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              </div>
            ) : models.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No models found.</p>
            ) : (
              models.map((m) => (
                <div key={m.id} className="space-y-1">
                  <button
                    onClick={() => handleModelExpand(m.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
                        <UserCircle className="h-4 w-4 text-[var(--text-muted)]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[var(--text)]">{m.name}</span>
                    </div>
                    <svg
                      className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${expandedModelId === m.id ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  {expandedModelId === m.id && (
                    <div className="ml-2 pl-2 border-l border-[var(--border)] space-y-2 py-1">
                      {/* Model Images (training images) */}
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Model Images</div>
                        {isLoadingModelImages && m.images.length === 0 ? (
                          <div className="flex items-center justify-center py-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                          </div>
                        ) : m.images.length === 0 ? (
                          <p className="py-1 text-[10px] text-[var(--text-muted)]">No training images.</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-1">
                            {m.images.map((img, i) => (
                              <button
                                key={i}
                                onClick={() => onAddLayer(
                                  { type: 'model-image', url: img.signedUrl || img.gcsUrl, gcsUrl: img.gcsUrl, modelId: m.id, label: `${m.name} - ${img.filename}` },
                                  'image',
                                )}
                                className="group relative overflow-hidden rounded-md border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                              >
                                <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="aspect-square w-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                                  <ImageIcon className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Generated Images */}
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Generated Images</div>
                        {isLoadingModelGenContent && !modelGenImages.has(m.id) ? (
                          <div className="flex items-center justify-center py-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                          </div>
                        ) : (modelGenImages.get(m.id) ?? []).length === 0 ? (
                          <p className="py-1 text-[10px] text-[var(--text-muted)]">No generated images.</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-1">
                            {(modelGenImages.get(m.id) ?? []).map((img, i) => (
                              <button
                                key={i}
                                onClick={() => onAddLayer(
                                  { type: 'gallery-image', url: img.url, gcsUrl: img.gcsUrl, modelId: m.id, label: `${m.name} - ${img.name}` },
                                  'image',
                                )}
                                className="group relative overflow-hidden rounded-md border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                              >
                                <img src={img.url} alt={img.name} className="aspect-square w-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                                  <ImageIcon className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Generated Videos */}
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Generated Videos</div>
                        {isLoadingModelGenContent && !modelGenVideos.has(m.id) ? (
                          <div className="flex items-center justify-center py-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                          </div>
                        ) : (modelGenVideos.get(m.id) ?? []).length === 0 ? (
                          <p className="py-1 text-[10px] text-[var(--text-muted)]">No generated videos.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-1">
                            {(modelGenVideos.get(m.id) ?? []).map((vid, i) => (
                              <button
                                key={i}
                                onClick={() => onAddLayer(
                                  { type: 'gallery-video', url: vid.url, gcsUrl: vid.gcsUrl, modelId: m.id, label: `${m.name} - ${vid.name}` },
                                  'video',
                                )}
                                className="group relative overflow-hidden rounded-md border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                              >
                                <video src={vid.url} className="aspect-video w-full object-cover" muted preload="metadata" onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }} />
                                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                                  <Film className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-3">
            {isLoadingJobs ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              </div>
            ) : (
              <>
                {/* Standalone completed jobs */}
                {standaloneJobs.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Standalone Jobs</div>
                    <div className="space-y-1">
                      {standaloneJobs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => onAddLayer(
                            { type: 'gallery-video', url: job.outputUrl || '', label: job.name || 'Job output' },
                            'video',
                          )}
                          className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
                        >
                          <video
                            src={job.outputUrl}
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                            muted
                            preload="metadata"
                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-[var(--text)]">{job.name || 'Job'}</div>
                            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Single
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batch / Master jobs */}
                {jobBatches.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Batches</div>
                    <div className="space-y-1.5">
                      {jobBatches.map((batch) => {
                        const typeBadge = batch.isMaster ? 'Master' : (batch.totalJobs ?? 0) > 1 ? 'Batch' : 'Single';
                        const statusColor = batch.status === 'completed' ? 'bg-emerald-500'
                          : batch.status === 'failed' ? 'bg-red-500'
                          : 'bg-amber-500';
                        const isExpanded = expandedBatchId === batch.id;

                        return (
                          <div key={batch.id}>
                            <button
                              onClick={() => expandBatch(batch.id)}
                              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-left transition-colors hover:bg-[var(--accent)]"
                            >
                              <ChevronRight className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-medium text-[var(--text)]">{batch.name || 'Batch'}</span>
                                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${
                                    typeBadge === 'Master' ? 'bg-purple-500/20 text-purple-400'
                                    : typeBadge === 'Batch' ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                  }`}>{typeBadge}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor}`} />
                                  {batch.status || 'pending'}
                                  {(batch.totalJobs ?? 0) > 0 && (
                                    <span className="ml-1">{batch.completedJobs ?? 0}/{batch.totalJobs} completed</span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="ml-3 mt-1 space-y-1 border-l border-[var(--border)] pl-2">
                                {isLoadingBatchJobs ? (
                                  <div className="flex items-center justify-center py-3">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                                  </div>
                                ) : expandedBatchJobs.length === 0 ? (
                                  <p className="py-2 text-[10px] text-[var(--text-muted)]">No jobs in this batch.</p>
                                ) : (
                                  <div className="grid grid-cols-2 gap-1">
                                    {expandedBatchJobs.filter((j) => j.status === 'completed' && (j.signedUrl || j.outputUrl)).map((job) => {
                                      const videoUrl = job.signedUrl || job.outputUrl || '';
                                      return (
                                        <button
                                          key={job.id}
                                          onClick={() => onAddLayer(
                                            { type: 'gallery-video', url: videoUrl, label: job.name || 'Job output' },
                                            'video',
                                          )}
                                          className="group relative overflow-hidden rounded-md border border-[var(--border)] transition-colors hover:border-[var(--primary)]"
                                        >
                                          <video
                                            src={videoUrl}
                                            className="aspect-video w-full object-cover"
                                            muted
                                            preload="metadata"
                                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                                          />
                                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                                            <span className="block truncate text-[8px] text-white leading-tight">{job.name || 'Output'}</span>
                                          </div>
                                          <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20 flex items-center justify-center">
                                            <Film className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {standaloneJobs.length === 0 && jobBatches.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">No completed jobs found.</p>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-3">
            <input ref={fileRef} type="file" accept="video/*,image/*" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-8 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]"
            >
              {isUploading ? (
                <>
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                  <span className="text-xs text-[var(--text-muted)]">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">Click to upload video or image</span>
                </>
              )}
            </button>
            {uploadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </div>
        )}

        {activeTab === 'url' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Media URL</label>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
              />
            </div>
            <button
              onClick={handleUrlAdd}
              disabled={!urlInput.trim()}
              className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Add to Canvas
            </button>
            <p className="text-[10px] text-[var(--text-muted)]">
              Supports direct links to videos (.mp4, .webm) and images (.jpg, .png).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
