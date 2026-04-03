'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Video, Type, Music, Film, Upload, Layers, LayoutGrid, Images, Maximize2, Minimize2, Trash2, Sparkles } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import PreviewModal from '@/components/ui/PreviewModal';
import type { MiniAppStep, MiniAppType, VideoGenConfig as VGC, TextOverlayConfig as TOC, BgMusicConfig as BMC, AttachVideoConfig as AVC, BatchVideoGenConfig as BVGC, ComposeConfig as CC, CarouselConfig as CRC } from '@/types';
import VideoGenConfig from './VideoGenConfig';
import TextOverlayConfig from './TextOverlayConfig';
import BgMusicConfig from './BgMusicConfig';
import AttachVideoConfig from './AttachVideoConfig';
import BatchVideoGenConfig from './BatchVideoGenConfig';
import TextOverlayPreview from './TextOverlayPreview';
import ComposeStepConfig from './ComposeStepConfig';
import CarouselStepConfig from './CarouselStepConfig';
import LibraryVideoSelector from './LibraryVideoSelector';
import LibraryVideoTrimPanel from './LibraryVideoTrimPanel';
import VariableTagging from './VariableTagging';

const nodeMeta: Record<MiniAppType, { label: string; icon: typeof Video; iconBg: string; iconColor: string }> = {
  'video-generation': { label: 'Video Generation', icon: Video, iconBg: '#f3f0ff', iconColor: '#7c3aed' },
  'text-overlay':     { label: 'Text Overlay',     icon: Type,  iconBg: '#eff6ff', iconColor: '#2563eb' },
  'bg-music':         { label: 'Background Music', icon: Music, iconBg: '#ecfdf5', iconColor: '#059669' },
  'attach-video':     { label: 'Attach Video',     icon: Film,  iconBg: '#fff7ed', iconColor: '#ea580c' },
  'batch-video-generation': { label: 'Batch Video Gen', icon: Layers, iconBg: '#fef3c7', iconColor: '#d97706' },
  'compose':               { label: 'Compose',         icon: LayoutGrid, iconBg: '#f0fdf4', iconColor: '#16a34a' },
  'carousel':              { label: 'Carousel',        icon: Images,     iconBg: '#fdf2f8', iconColor: '#ec4899' },
};

type SourceConfig = {
  videoSource: 'tiktok' | 'upload' | 'library' | 'generate';
  tiktokUrl: string;
  videoUrl: string;
  previewUrl?: string;
  uploadedFilename: string;
  isUploading: boolean;
  uploadProgress: number;
  onVideoSourceChange: (src: 'tiktok' | 'upload' | 'library' | 'generate') => void;
  onTiktokUrlChange: (url: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoRemove: () => void;
  onFileDrop?: (file: File) => void;
  // Library mode
  libraryVideos?: Record<string, string>;
  onLibraryVideoSelect?: (modelId: string, gcsUrl: string) => void;
  onLibraryVideoRemove?: (modelId: string) => void;
  selectedModelIds?: string[];
  sourceTrimStart?: number;
  sourceTrimEnd?: number;
  onSourceTrimChange?: (start?: number, end?: number) => void;
  // Variable tagging
  variableValues?: Record<string, string>;
  onVariableValuesChange?: (values: Record<string, string>) => void;
  // Generate mode callback
  onGeneratedVideo?: (url: string) => void;
};

export type MasterModel = { modelId: string; modelName: string; primaryImageUrl: string; primaryGcsUrl: string };

export default function NodeConfigPanel({
  selectedId, steps, onUpdateStep, onRemoveStep, onClose, sourceConfig, videoUrl, sourceDuration, validationError, isLoadingVideo, masterMode, masterModels, isExpanded, onToggleExpand,
}: {
  selectedId: string | null;
  steps: MiniAppStep[];
  onUpdateStep: (id: string, step: MiniAppStep) => void;
  onRemoveStep: (id: string) => void;
  onClose: () => void;
  sourceConfig: SourceConfig;
  videoUrl?: string;
  sourceDuration?: number;
  validationError?: string;
  isLoadingVideo?: boolean;
  masterMode?: boolean;
  masterModels?: MasterModel[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const step = selectedId && selectedId !== 'source' ? steps.find((s) => s.id === selectedId) : null;

  // Compute source video URL — in library mode, use the first available library video
  const resolvedSourceVideoUrl = sourceConfig.previewUrl || sourceConfig.videoUrl || (
    sourceConfig.videoSource === 'library' && sourceConfig.libraryVideos
      ? Object.values(sourceConfig.libraryVideos)[0] || undefined
      : undefined
  );

  /* ── Source node ── */
  if (selectedId === 'source') {
    return (
      <div className="h-full bg-transparent">
        <div className="flex items-center justify-between shadow-sm px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]">
              <Upload className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </div>
            <span className="text-sm font-semibold text-[var(--text)]">Video Source</span>
          </div>
          <div className="flex items-center gap-1">
            {onToggleExpand && (
              <button onClick={onToggleExpand} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]" title={isExpanded ? 'Minimize panel' : 'Expand panel'}>
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className={`p-4 ${isExpanded ? '' : 'space-y-4'}`}>
          <div className={isExpanded ? 'mx-auto max-w-2xl space-y-4' : 'space-y-4'}>
          <div className="flex gap-2">
            {(masterMode
              ? (['tiktok', 'upload', 'library', 'generate'] as const)
              : (['tiktok', 'upload', 'generate'] as const)
            ).map((src) => (
              <button
                key={src}
                onClick={() => sourceConfig.onVideoSourceChange(src)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  sourceConfig.videoSource === src
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                }`}
              >
                {src === 'tiktok' ? 'Paste URL' : src === 'upload' ? 'Upload Video' : src === 'library' ? 'From Library' : 'Generate'}
              </button>
            ))}
          </div>

          {sourceConfig.videoSource === 'generate' ? (
            <GenerateVideoInline onGenerated={sourceConfig.onGeneratedVideo} />
          ) : sourceConfig.videoSource === 'library' && masterMode ? (
            <div className="space-y-3">
              <LibraryVideoSelector
                masterModels={masterModels || []}
                selectedModelIds={sourceConfig.selectedModelIds || []}
                libraryVideos={sourceConfig.libraryVideos || {}}
                onSelect={sourceConfig.onLibraryVideoSelect || (() => {})}
                onRemove={sourceConfig.onLibraryVideoRemove || (() => {})}
              />
              <LibraryVideoTrimPanel
                masterModels={masterModels || []}
                selectedModelIds={sourceConfig.selectedModelIds || []}
                libraryVideos={sourceConfig.libraryVideos || {}}
                trimStart={sourceConfig.sourceTrimStart}
                trimEnd={sourceConfig.sourceTrimEnd}
                onTrimChange={sourceConfig.onSourceTrimChange}
              />
            </div>
          ) : sourceConfig.videoSource === 'tiktok' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Video URL</label>
                <input
                  value={sourceConfig.tiktokUrl}
                  onChange={(e) => sourceConfig.onTiktokUrlChange(e.target.value)}
                  placeholder="Paste TikTok or Instagram URL..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
                />
              </div>
              {/* Video preview / loading */}
              {sourceConfig.tiktokUrl.trim() && (
                isLoadingVideo ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] py-6">
                    <div className="h-6 w-6 rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)] animate-spin" />
                    <span className="text-xs text-[var(--text-muted)]">Fetching video...</span>
                  </div>
                ) : sourceConfig.previewUrl ? (
                  <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-black cursor-pointer" onClick={() => setPreviewUrl(sourceConfig.previewUrl || null)}>
                    <video
                      src={sourceConfig.previewUrl}
                      className="w-full rounded-xl"
                      style={{ maxHeight: 200 }}
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Video File</label>
              <input ref={fileRef} type="file" accept="video/*" onChange={sourceConfig.onVideoUpload} className="hidden" />
              {sourceConfig.videoUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5">
                  <video src={sourceConfig.previewUrl || sourceConfig.videoUrl} className="h-16 w-12 shrink-0 rounded-lg object-cover bg-black cursor-pointer" muted playsInline preload="none" onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }} onClick={() => setPreviewUrl(sourceConfig.previewUrl || sourceConfig.videoUrl)} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--text)]">{sourceConfig.uploadedFilename}</p>
                    <button onClick={sourceConfig.onVideoRemove} className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file?.type.startsWith('video/') && sourceConfig.onFileDrop) sourceConfig.onFileDrop(file);
                  }}
                  className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed py-6 transition-colors ${
                    isDragging
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
                  } ${sourceConfig.isUploading ? 'pointer-events-none' : ''}`}
                >
                  {sourceConfig.isUploading ? (
                    <>
                      <div className="h-6 w-6 rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)] animate-spin" />
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">Uploading\u2026 {sourceConfig.uploadProgress}%</span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
                        <Upload className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {isDragging ? 'Drop video here' : 'Click or drag video here'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-[var(--text-muted)]">
            Not needed if the first step is Video Generation with Subtle Animation mode.
          </p>
          {sourceConfig.variableValues && sourceConfig.onVariableValuesChange && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <VariableTagging values={sourceConfig.variableValues} onChange={sourceConfig.onVariableValuesChange} />
            </div>
          )}
          </div>
        </div>
        {previewUrl && <PreviewModal src={previewUrl} type="video" onClose={() => setPreviewUrl(null)} />}
      </div>
    );
  }

  /* ── Pipeline step ── */
  if (step) {
    const meta = nodeMeta[step.type];
    const Icon = meta.icon;

    return (
      <div className="flex h-full flex-col bg-transparent">
        <div className="flex items-center justify-between shadow-sm px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: meta.iconBg }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: meta.iconColor }} />
            </div>
            <span className="text-sm font-semibold text-[var(--text)]">{meta.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { onRemoveStep(step.id); onClose(); }} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-red-500" title="Remove step">
              <Trash2 className="h-4 w-4" />
            </button>
            {onToggleExpand && (
              <button onClick={onToggleExpand} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]" title={isExpanded ? 'Minimize panel' : 'Expand panel'}>
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {validationError && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {validationError}
            </div>
          )}
          {step.type === 'text-overlay' && (
            <div className={isExpanded ? 'grid grid-cols-2 gap-6 h-full' : ''}>
              <TextOverlayPreview
                config={step.config as TOC}
                onChange={(c) => onUpdateStep(step.id, { ...step, config: c })}
                videoUrl={videoUrl}
                isLoadingVideo={isLoadingVideo}
                isExpanded={isExpanded}
              />
              <div className={isExpanded ? 'overflow-y-auto' : ''}>
                <TextOverlayConfig config={step.config as TOC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} isExpanded={isExpanded} />
              </div>
            </div>
          )}
          {step.type === 'video-generation' && <VideoGenConfig key={step.id} config={step.config as VGC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} sourceDuration={sourceConfig.videoSource === 'library' ? undefined : sourceDuration} sourceVideoUrl={resolvedSourceVideoUrl} stepId={step.id} masterMode={masterMode} masterModels={masterModels} isExpanded={isExpanded} />}
          {step.type === 'batch-video-generation' && <BatchVideoGenConfig key={step.id} config={step.config as BVGC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} sourceDuration={sourceConfig.videoSource === 'library' ? undefined : sourceDuration} sourceVideoUrl={resolvedSourceVideoUrl} stepId={step.id} masterMode={masterMode} isExpanded={isExpanded} />}
          {step.type === 'bg-music' && <div className={isExpanded ? 'mx-auto max-w-2xl' : ''}><BgMusicConfig config={step.config as BMC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} steps={steps} currentStepId={step.id} /></div>}
          {step.type === 'attach-video' && <div className={isExpanded ? 'mx-auto max-w-2xl' : ''}><AttachVideoConfig config={step.config as AVC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} steps={steps} currentStepId={step.id} /></div>}
          {step.type === 'compose' && <ComposeStepConfig config={step.config as CC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} steps={steps} currentStepId={step.id} isExpanded={isExpanded} masterModels={masterModels} libraryVideos={sourceConfig.videoSource === 'library' ? sourceConfig.libraryVideos : undefined} />}
          {step.type === 'carousel' && <CarouselStepConfig config={step.config as CRC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} stepId={step.id} masterMode={masterMode} masterModels={masterModels} isExpanded={isExpanded} />}
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  return (
    <div className="flex h-full flex-col items-center justify-center bg-transparent p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
        <Video className="h-5 w-5 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm font-medium text-[var(--text)]">Select a step</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Click a node to edit its settings</p>
    </div>
  );
}

/* ── Inline Generate Video ── */

type GenModel = { id: string; label: string; requiresImage: boolean; supportsImage: boolean; aspectRatios: string[]; durations: string[] };
type GenState = 'idle' | 'uploading' | 'generating' | 'done' | 'error';

function GenerateVideoInline({ onGenerated }: { onGenerated?: (url: string) => void }) {
  const [models, setModels] = useState<GenModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('5');
  const [state, setState] = useState<GenState>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/generate-video')
      .then((r) => r.json())
      .then((d) => { setModels(d.models || []); if (d.models?.[0]) setSelectedModel(d.models[0].id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state === 'generating') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const current = models.find((m) => m.id === selectedModel);

  // When model changes, clamp aspect ratio and duration to valid options
  useEffect(() => {
    if (!current) return;
    if (!current.aspectRatios.includes(aspectRatio)) setAspectRatio(current.aspectRatios[0] || '9:16');
    if (!current.durations.includes(duration)) setDuration(current.durations[0] || '5');
  }, [selectedModel, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsImage = current?.requiresImage ?? false;
  const canImage = current?.supportsImage ?? false;
  const missingImage = needsImage && !imageUrl;

  // Validation issues to show
  const issues: string[] = [];
  if (!prompt.trim()) issues.push('Prompt required');
  if (missingImage) issues.push('Image required for this model');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setState('uploading');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setImageUrl(data.url || data.path);
    } catch {}
    setState('idle');
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (issues.length > 0) return;
    setState('generating');
    setResultUrl(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: selectedModel, prompt: prompt.trim(), imageUrl: imageUrl || undefined, aspectRatio, duration }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultUrl(data.videoUrl);
        setState('done');
        onGenerated?.(data.videoUrl);
      } else {
        setErrorMsg(data.error || 'Failed');
        setState('error');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState('error');
    }
  };

  const fmt = (s: number) => { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; };

  if (state === 'generating') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--accent)] py-8">
        <Spinner className="h-6 w-6 text-[var(--primary)]" />
        <span className="text-xs font-semibold text-[var(--primary)]">Generating... {fmt(elapsed)}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{current?.label} — takes 1-5 min</span>
      </div>
    );
  }

  if (state === 'done' && resultUrl) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-emerald-400/60 bg-black">
          <video src={resultUrl} controls autoPlay loop className="w-full" style={{ maxHeight: 200 }} />
        </div>
        <div className="flex gap-2">
          <a href={resultUrl} download target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-center text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent)]">Download</a>
          <button onClick={() => { setState('idle'); setResultUrl(null); }} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent)]">New</button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-center dark:bg-red-950/30 dark:border-red-800/40">
        <p className="text-[11px] font-medium text-red-700 dark:text-red-400">{errorMsg}</p>
        <button onClick={() => setState('idle')} className="mt-2 rounded-lg bg-red-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-600">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Model */}
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}{m.requiresImage ? ' (needs image)' : ''}
          </option>
        ))}
      </select>

      {/* Image — only if model supports it */}
      {canImage && (
        imagePreview ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
            <img src={imagePreview} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-[var(--text)]">Reference image</span>
              {state === 'uploading' ? (
                <span className="text-[10px] text-[var(--text-muted)]">Uploading...</span>
              ) : (
                <button onClick={() => { setImageUrl(null); setImagePreview(null); }} className="text-[10px] text-red-500 hover:underline">Remove</button>
              )}
            </div>
          </div>
        ) : (
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)] ${needsImage ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : 'border-[var(--border)]'}`}>
            <Upload className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <span className="text-[11px] text-[var(--text-muted)]">{needsImage ? 'Upload image (required)' : 'Upload image (optional)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        )
      )}

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the video..."
        rows={2}
        className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />

      {/* Aspect + Duration — only show valid options for current model */}
      <div className="flex gap-2">
        <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11px] text-[var(--text)] focus:outline-none">
          {(current?.aspectRatios || ['9:16', '16:9']).map((ar) => (
            <option key={ar} value={ar}>{ar}</option>
          ))}
        </select>
        <select value={duration} onChange={(e) => setDuration(e.target.value)} className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11px] text-[var(--text)] focus:outline-none">
          {(current?.durations || ['5']).map((d) => (
            <option key={d} value={d}>{d}s</option>
          ))}
        </select>
      </div>

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={issues.length > 0 || state === 'uploading'}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles className="h-3 w-3" />
        {issues.length > 0 ? issues[0] : 'Generate Video'}
      </button>
    </div>
  );
}
