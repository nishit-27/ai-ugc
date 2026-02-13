'use client';

import { useRef, useState } from 'react';
import { Upload, X, Video, Type, Music, Film, Link, Layers } from 'lucide-react';
import PreviewModal from '@/components/ui/PreviewModal';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import type { AttachVideoConfig as AVC, MiniAppStep, MiniAppType } from '@/types';

const stepIcons: Record<MiniAppType, typeof Video> = {
  'video-generation': Video,
  'batch-video-generation': Layers,
  'text-overlay': Type,
  'bg-music': Music,
  'attach-video': Film,
};

const stepLabels: Record<MiniAppType, string> = {
  'video-generation': 'Video Generation',
  'batch-video-generation': 'Batch Video Gen',
  'text-overlay': 'Text Overlay',
  'bg-music': 'Background Music',
  'attach-video': 'Attach Video',
};

type VideoSource = 'tiktok' | 'upload' | 'pipeline';

function deriveSource(config: AVC): VideoSource {
  if (config.sourceStepId) return 'pipeline';
  if (config.tiktokUrl) return 'tiktok';
  return 'upload';
}

export default function AttachVideoConfig({
  config, onChange, steps, currentStepId,
}: {
  config: AVC;
  onChange: (c: AVC) => void;
  steps?: MiniAppStep[];
  currentStepId?: string;
}) {
  const { uploadVideo, isUploading, progress } = useVideoUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<VideoSource>(() => deriveSource(config));
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Steps that appear before the current step
  const previousSteps = (steps && currentStepId)
    ? steps.slice(0, steps.findIndex((s) => s.id === currentStepId))
    : [];

  const hasPipelineOption = previousSteps.length > 0;

  const sourceOptions: { key: VideoSource; label: string }[] = [
    { key: 'tiktok', label: 'TikTok URL' },
    { key: 'upload', label: 'Upload Video' },
    ...(hasPipelineOption ? [{ key: 'pipeline' as VideoSource, label: 'From Pipeline' }] : []),
  ];

  const handleFile = async (file: File) => {
    try {
      const result = await uploadVideo(file);
      if (result) {
        onChange({ ...config, videoUrl: result.gcsUrl, sourceStepId: undefined, tiktokUrl: undefined });
        setUploadedFilename(file.name);
      }
    } catch (err) {
      console.error('Upload attach video error:', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleSourceChange = (src: VideoSource) => {
    setActiveSource(src);
    if (src === 'upload') {
      onChange({ ...config, sourceStepId: undefined, tiktokUrl: undefined });
    } else if (src === 'tiktok') {
      onChange({ ...config, videoUrl: '', sourceStepId: undefined });
    } else {
      onChange({ ...config, videoUrl: '', tiktokUrl: undefined, sourceStepId: previousSteps[0]?.id });
    }
  };

  return (
    <div className="space-y-5">
      {/* Position */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Position</label>
        <div className="flex gap-2">
          {(['before', 'after'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => onChange({ ...config, position: pos })}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                config.position === pos
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {pos === 'before' ? 'Prepend (Before)' : 'Append (After)'}
            </button>
          ))}
        </div>
      </div>

      {/* Video Source Toggle */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Video Source</label>
        <div className="flex gap-2">
          {sourceOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSourceChange(opt.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                activeSource === opt.key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* TikTok URL mode */}
      {activeSource === 'tiktok' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">TikTok URL</label>
          <input
            value={config.tiktokUrl || ''}
            onChange={(e) => onChange({ ...config, tiktokUrl: e.target.value, videoUrl: '', sourceStepId: undefined })}
            placeholder="https://www.tiktok.com/@user/video/..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
          />
        </div>
      )}

      {/* Upload mode */}
      {activeSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Video Clip</label>
          <input ref={fileRef} type="file" accept="video/*" onChange={handleUpload} className="hidden" />

          {config.videoUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5">
              <video
                src={config.videoUrl}
                className="h-16 w-24 shrink-0 rounded-lg object-cover bg-black cursor-pointer"
                muted playsInline preload="metadata"
                onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                onClick={() => setPreviewUrl(config.videoUrl)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--text)]">{uploadedFilename || 'Video clip'}</p>
                <button
                  onClick={() => { onChange({ ...config, videoUrl: '' }); setUploadedFilename(null); }}
                  className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-red-500 transition-colors"
                >
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
                if (file?.type.startsWith('video/')) handleFile(file);
              }}
              className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed py-6 transition-colors ${
                isDragging
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
              } ${isUploading ? 'pointer-events-none' : ''}`}
            >
              {isUploading ? (
                <>
                  <div className="h-8 w-8 rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)] animate-spin" />
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">Uploading… {progress}%</span>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]">
                    <Upload className="h-4 w-4 text-[var(--text-muted)]" />
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

      {/* Pipeline mode */}
      {activeSource === 'pipeline' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Select Step Output</label>
          <div className="space-y-2">
            {previousSteps.map((s, i) => {
              const StepIcon = stepIcons[s.type];
              const isSelected = config.sourceStepId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onChange({ ...config, sourceStepId: s.id, videoUrl: '', tiktokUrl: undefined })}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--accent)] shadow-sm'
                      : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent-border)]'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
                    <StepIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[var(--text)]">
                      {stepLabels[s.type]}
                      <span className="ml-1.5 text-[var(--text-muted)]">#{i + 1}</span>
                    </p>
                  </div>
                  {isSelected && (
                    <Link className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {previewUrl && <PreviewModal src={previewUrl} type="video" onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}
