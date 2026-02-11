'use client';

import { useEffect, useState, useRef } from 'react';
import { useModels } from '@/hooks/useModels';
import { X, Clock, Monitor, Volume2, VolumeX, ChevronDown } from 'lucide-react';
import type { VideoGenConfig as VGC, ModelImage } from '@/types';

type ImageSource = 'model' | 'upload';

// Duration options per mode
const VEO_DURATIONS = ['4s', '6s', '8s'];

// Aspect ratio options
const VEO_ASPECTS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'auto', label: 'Auto' },
];

function Dropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]"
      >
        <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">{label}</span>
        <span>{selected?.label || value}</span>
        <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full z-50 mb-1 min-w-[120px] max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                opt.value === value
                  ? 'bg-[var(--accent)] font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--accent)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VideoGenConfig({
  config, onChange, sourceDuration,
}: {
  config: VGC;
  onChange: (c: VGC) => void;
  sourceDuration?: number;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>(
    () => (config.imageUrl && !config.imageId) ? 'upload' : 'model'
  );

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    if (src === 'upload') {
      onChange({ ...config, modelId: undefined, imageId: undefined });
    } else {
      onChange({ ...config, imageUrl: undefined });
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        onChange({ ...config, imageUrl: data.url || data.path, modelId: undefined, imageId: undefined });
      }
    } catch {
      // handled silently
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  };

  const isMotion = config.mode === 'motion-control';
  const isSubtle = config.mode === 'subtle-animation';
  const audioOn = config.generateAudio ?? true;

  return (
    <div className="space-y-5">
      {/* Mode */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Mode</label>
        <div className="flex gap-2">
          {(['motion-control', 'subtle-animation'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ ...config, mode })}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                config.mode === mode
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {mode === 'motion-control' ? 'Motion Control' : 'Subtle Animation'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          {isMotion ? 'Kling 2.6 — face swap onto input video' : 'Veo 3.1 — generates video from a single image'}
        </p>
      </div>

      {/* Image Source Toggle */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Image Source</label>
        <div className="flex gap-2">
          {([
            { key: 'model' as ImageSource, label: 'From Model' },
            { key: 'upload' as ImageSource, label: 'Upload Image' },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleImageSourceChange(opt.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                imageSource === opt.key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model + Image Picker */}
      {imageSource === 'model' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
            <select
              value={config.modelId || ''}
              onChange={(e) => onChange({ ...config, modelId: e.target.value, imageId: undefined, imageUrl: undefined })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
            >
              <option value="">Select a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {config.modelId && imagesLoading && modelImages.length === 0 && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-8">
              <div className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
              <span className="text-xs text-[var(--text-muted)]">Loading images...</span>
            </div>
          )}

          {config.modelId && modelImages.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Image</label>
              <div className="grid grid-cols-4 gap-1.5">
                {modelImages.map((img: ModelImage) => (
                  <button
                    key={img.id}
                    onClick={() => onChange({ ...config, imageId: img.id, imageUrl: undefined })}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                      config.imageId === img.id
                        ? 'border-[var(--primary)] shadow-md'
                        : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                    }`}
                  >
                    <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                    {config.imageId === img.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="h-4 w-4 rounded-full border-2 border-white bg-[var(--primary)]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Direct Image Upload */}
      {imageSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Image</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

          {config.imageUrl ? (
            <div className="relative">
              <img
                src={config.imageUrl}
                alt="Uploaded"
                className="max-h-36 w-full rounded-xl border border-[var(--border)] object-contain bg-[var(--background)] p-1"
              />
              <button
                onClick={() => onChange({ ...config, imageUrl: undefined })}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-colors ${
                isUploadingImage
                  ? 'border-[var(--accent-border)] bg-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
              }}
              onDrop={handleDrop}
            >
              {isUploadingImage ? (
                <>
                  <div className="h-8 w-8 rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)] animate-spin" />
                  <span className="mt-2 text-xs font-medium text-[var(--text-muted)]">Uploading…</span>
                </>
              ) : (
                <>
                  <span className="text-2xl text-[var(--text-muted)]">+</span>
                  <span className="mt-1 text-xs text-[var(--text-muted)]">Click or drag image here</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploadingImage} />
            </label>
          )}
        </div>
      )}

      {/* Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Prompt</label>
        <textarea
          value={config.prompt || ''}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Describe the motion…"
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
        />
      </div>

      {/* ─── Toolbar ─── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--accent)] px-3 py-2.5">

          {/* Duration slider (motion) / dropdown (veo) */}
          {isMotion && (() => {
            const maxVal = sourceDuration || 30;
            const currentVal = config.maxSeconds || sourceDuration || 10;
            return (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">Duration</span>
                <input
                  type="range"
                  min={5}
                  max={maxVal}
                  step={1}
                  value={Math.min(currentVal, maxVal)}
                  onChange={(e) => onChange({ ...config, maxSeconds: parseInt(e.target.value) })}
                  className="h-1.5 w-24 cursor-pointer accent-[var(--primary)]"
                />
                <span className="min-w-[2.5rem] text-xs font-medium tabular-nums">{Math.min(currentVal, maxVal)}s</span>
              </div>
            );
          })()}
          {isSubtle && (
            <Dropdown
              icon={Clock}
              label="Duration"
              value={config.duration || '4s'}
              options={VEO_DURATIONS.map((d) => ({ value: d, label: d }))}
              onChange={(v) => onChange({ ...config, duration: v })}
            />
          )}

          <div className="h-5 w-px bg-[var(--border)]" />

          {/* Aspect Ratio — Veo only (motion control follows input video) */}
          {isSubtle && (
            <>
              <Dropdown
                icon={Monitor}
                label="Aspect"
                value={config.aspectRatio || '9:16'}
                options={VEO_ASPECTS}
                onChange={(v) => onChange({ ...config, aspectRatio: v })}
              />
              <div className="h-5 w-px bg-[var(--border)]" />
            </>
          )}

          {/* Resolution — Veo only */}
          {isSubtle && (
            <>
              <Dropdown
                icon={Monitor}
                label="Res"
                value={config.resolution || '720p'}
                options={[
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                  { value: '4k', label: '4K' },
                ]}
                onChange={(v) => onChange({ ...config, resolution: v as '720p' | '1080p' | '4k' })}
              />
              <div className="h-5 w-px bg-[var(--border)]" />
            </>
          )}

          {/* Audio toggle pill */}
          <button
            onClick={() => onChange({ ...config, generateAudio: !audioOn })}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
              audioOn
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)]'
            }`}
          >
            {audioOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Audio
          </button>

        </div>
      </div>
    </div>
  );
}
