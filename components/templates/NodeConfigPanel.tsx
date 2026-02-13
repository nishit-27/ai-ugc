'use client';

import { useRef, useState } from 'react';
import { X, Video, Type, Music, Film, Upload, Layers } from 'lucide-react';
import type { MiniAppStep, MiniAppType, VideoGenConfig as VGC, TextOverlayConfig as TOC, BgMusicConfig as BMC, AttachVideoConfig as AVC, BatchVideoGenConfig as BVGC } from '@/types';
import VideoGenConfig from './VideoGenConfig';
import TextOverlayConfig from './TextOverlayConfig';
import BgMusicConfig from './BgMusicConfig';
import AttachVideoConfig from './AttachVideoConfig';
import BatchVideoGenConfig from './BatchVideoGenConfig';
import TextOverlayPreview from './TextOverlayPreview';

const nodeMeta: Record<MiniAppType, { label: string; icon: typeof Video; iconBg: string; iconColor: string }> = {
  'video-generation': { label: 'Video Generation', icon: Video, iconBg: '#f3f0ff', iconColor: '#7c3aed' },
  'text-overlay':     { label: 'Text Overlay',     icon: Type,  iconBg: '#eff6ff', iconColor: '#2563eb' },
  'bg-music':         { label: 'Background Music', icon: Music, iconBg: '#ecfdf5', iconColor: '#059669' },
  'attach-video':     { label: 'Attach Video',     icon: Film,  iconBg: '#fff7ed', iconColor: '#ea580c' },
  'batch-video-generation': { label: 'Batch Video Gen', icon: Layers, iconBg: '#fef3c7', iconColor: '#d97706' },
};

type SourceConfig = {
  videoSource: 'tiktok' | 'upload';
  tiktokUrl: string;
  videoUrl: string;
  previewUrl?: string;
  uploadedFilename: string;
  isUploading: boolean;
  uploadProgress: number;
  onVideoSourceChange: (src: 'tiktok' | 'upload') => void;
  onTiktokUrlChange: (url: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoRemove: () => void;
  onFileDrop?: (file: File) => void;
};

export default function NodeConfigPanel({
  selectedId, steps, onUpdateStep, onRemoveStep, onClose, sourceConfig, videoUrl, sourceDuration, validationError, isLoadingVideo,
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
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const step = selectedId && selectedId !== 'source' ? steps.find((s) => s.id === selectedId) : null;

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
          <button onClick={onClose} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            {(['tiktok', 'upload'] as const).map((src) => (
              <button
                key={src}
                onClick={() => sourceConfig.onVideoSourceChange(src)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  sourceConfig.videoSource === src
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                }`}
              >
                {src === 'tiktok' ? 'Paste URL' : 'Upload Video'}
              </button>
            ))}
          </div>

          {sourceConfig.videoSource === 'tiktok' ? (
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
                  <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-black">
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
                  <video src={sourceConfig.previewUrl || sourceConfig.videoUrl} className="h-16 w-12 shrink-0 rounded-lg object-cover bg-black" muted playsInline preload="metadata" onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }} />
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
        </div>
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
          <button onClick={onClose} className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {validationError && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {validationError}
            </div>
          )}
          {step.type === 'text-overlay' && (
            <TextOverlayPreview
              config={step.config as TOC}
              onChange={(c) => onUpdateStep(step.id, { ...step, config: c })}
              videoUrl={videoUrl}
              isLoadingVideo={isLoadingVideo}
            />
          )}
          {step.type === 'video-generation' && <VideoGenConfig config={step.config as VGC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} sourceDuration={sourceDuration} sourceVideoUrl={sourceConfig.previewUrl || sourceConfig.videoUrl} stepId={step.id} />}
          {step.type === 'batch-video-generation' && <BatchVideoGenConfig config={step.config as BVGC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} sourceDuration={sourceDuration} sourceVideoUrl={sourceConfig.previewUrl || sourceConfig.videoUrl} stepId={step.id} />}
          {step.type === 'text-overlay' && <TextOverlayConfig config={step.config as TOC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} />}
          {step.type === 'bg-music' && <BgMusicConfig config={step.config as BMC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} steps={steps} currentStepId={step.id} />}
          {step.type === 'attach-video' && <AttachVideoConfig config={step.config as AVC} onChange={(c) => onUpdateStep(step.id, { ...step, config: c })} steps={steps} currentStepId={step.id} />}
        </div>

        <div className="shadow-[0_-1px_2px_rgba(0,0,0,0.05)] p-4">
          <button
            onClick={() => { onRemoveStep(step.id); onClose(); }}
            className="w-full rounded-lg border border-[var(--border)] py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900 dark:hover:bg-red-950"
          >
            Remove Step
          </button>
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
