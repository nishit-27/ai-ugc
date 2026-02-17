'use client';

import { useState, useRef } from 'react';
import { Film, ImageIcon, UserCircle, Upload, Link2, Layers } from 'lucide-react';
import { signUrls } from '@/lib/signedUrlClient';
import type { LayerSource, StepResult, Model } from '@/types';

type Tab = 'pipeline' | 'videos' | 'images' | 'models' | 'upload' | 'url';

type VideoItem = { url: string; gcsUrl: string; name: string };
type ImageItem = { url: string; gcsUrl: string; name: string };
type ModelItem = { id: string; name: string; avatarUrl?: string; images: { gcsUrl: string; signedUrl?: string; filename: string }[] };

type ComposeAssetPanelProps = {
  mode: 'pipeline' | 'standalone';
  onAddLayer: (source: LayerSource, type: 'video' | 'image') => void;
  stepResults?: StepResult[];
};

export default function ComposeAssetPanel({
  mode,
  onAddLayer,
  stepResults,
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const videosLoaded = useRef(false);
  const imagesLoaded = useRef(false);
  const modelsLoaded = useRef(false);

  const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
    ...(mode === 'pipeline' ? [{ id: 'pipeline' as Tab, label: 'Pipeline', icon: Layers }] : []),
    { id: 'videos', label: 'Videos', icon: Film },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'models', label: 'Models', icon: UserCircle },
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'url', label: 'URL', icon: Link2 },
  ];

  const loadVideos = async () => {
    if (videosLoaded.current || isLoadingVideos) return;
    setIsLoadingVideos(true);
    videosLoaded.current = true;
    try {
      const res = await fetch('/api/videos?page=1&perPage=20&mode=generated');
      const data = await res.json();
      const rawVideos = data.videos;
      if (!Array.isArray(rawVideos)) return;

      const gcsUrls = rawVideos
        .map((v: { url?: string; path?: string }) => v.url || v.path || '')
        .filter((url: string) => url.includes('storage.googleapis.com'));

      const signed = gcsUrls.length > 0 ? await signUrls(gcsUrls) : new Map<string, string>();

      const items: VideoItem[] = rawVideos.slice(0, 20).map((v: { url?: string; path?: string; name?: string }) => {
        const gcsUrl = v.url || v.path || '';
        return {
          gcsUrl,
          url: signed.get(gcsUrl) || gcsUrl,
          name: v.name || 'Video',
        };
      });
      setVideos(items);
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const loadImages = async () => {
    if (imagesLoaded.current || isLoadingImages) return;
    setIsLoadingImages(true);
    imagesLoaded.current = true;
    try {
      const res = await fetch('/api/generated-images?page=1&limit=20&signed=false');
      const data = await res.json();
      const rawImages = data.images;
      if (!Array.isArray(rawImages)) return;

      const gcsUrls = rawImages
        .map((img: { gcsUrl?: string }) => img.gcsUrl || '')
        .filter((url: string) => url.includes('storage.googleapis.com'));

      const signed = gcsUrls.length > 0 ? await signUrls(gcsUrls) : new Map<string, string>();

      const items: ImageItem[] = rawImages.slice(0, 20).map((img: { gcsUrl?: string; signedUrl?: string; filename?: string }) => {
        const gcsUrl = img.gcsUrl || '';
        return {
          gcsUrl,
          url: img.signedUrl || signed.get(gcsUrl) || gcsUrl,
          name: img.filename || 'Image',
        };
      });
      setImages(items);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setIsLoadingImages(false);
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

      const avatarGcsUrls = rawModels
        .map((m) => m.avatarUrl || '')
        .filter((url) => url.includes('storage.googleapis.com') && !url.includes('X-Goog-Signature='));

      const signed = avatarGcsUrls.length > 0 ? await signUrls(avatarGcsUrls) : new Map<string, string>();

      setModels(rawModels.map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl ? (signed.get(m.avatarUrl) || m.avatarUrl) : undefined,
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

      const gcsUrls = rawImages
        .filter((img) => !img.signedUrl)
        .map((img) => img.gcsUrl)
        .filter((url) => url.includes('storage.googleapis.com'));

      const signed = gcsUrls.length > 0 ? await signUrls(gcsUrls) : new Map<string, string>();

      const withSigned = rawImages.map((img) => ({
        ...img,
        signedUrl: img.signedUrl || signed.get(img.gcsUrl) || img.gcsUrl,
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

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'videos') loadVideos();
    if (tab === 'images') loadImages();
    if (tab === 'models') loadModels();
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
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const isVideo = file.type.startsWith('video/');
      const formData = new FormData();
      formData.append(isVideo ? 'video' : 'image', file);
      const endpoint = isVideo ? '/api/upload-video' : '/api/upload-image';
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url || data.gcsUrl) {
        const displayUrl = data.url || data.gcsUrl;
        const gcsUrl = data.gcsUrl || data.url;
        onAddLayer(
          { type: 'upload', url: displayUrl, gcsUrl, label: file.name },
          isVideo ? 'video' : 'image',
        );
      }
    } catch (err) {
      console.error('Upload failed:', err);
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
            {(!stepResults || stepResults.length === 0) ? (
              <p className="text-xs text-[var(--text-muted)]">No step outputs available yet.</p>
            ) : (
              stepResults.map((sr) => (
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
              ))
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
                    <div className="ml-2 pl-2 border-l border-[var(--border)]">
                      {isLoadingModelImages && m.images.length === 0 ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                        </div>
                      ) : m.images.length === 0 ? (
                        <p className="py-2 text-[10px] text-[var(--text-muted)]">No images for this model.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 py-1">
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
                  )}
                </div>
              ))
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
