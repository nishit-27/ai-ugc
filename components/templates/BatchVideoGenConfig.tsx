'use client';

import { useEffect, useState, useRef } from 'react';
import { useModels } from '@/hooks/useModels';
import { X, Clock, Monitor, Volume2, VolumeX, ChevronDown, Check } from 'lucide-react';
import type { BatchVideoGenConfig as BVGC, BatchImageEntry, ModelImage } from '@/types';

type ImageSource = 'model' | 'upload';

const VEO_DURATIONS = ['4s', '6s', '8s'];
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

export default function BatchVideoGenConfig({
  config, onChange, sourceDuration,
}: {
  config: BVGC;
  onChange: (c: BVGC) => void;
  sourceDuration?: number;
}) {
  const { models, modelImages, imagesLoading, loadModelImages } = useModels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>(
    () => (config.images.length > 0 && config.images.some(i => i.imageUrl && !i.imageId)) ? 'upload' : 'model'
  );

  useEffect(() => {
    if (config.modelId) loadModelImages(config.modelId);
  }, [config.modelId, loadModelImages]);

  const handleImageSourceChange = (src: ImageSource) => {
    setImageSource(src);
    onChange({ ...config, images: [], modelId: src === 'upload' ? undefined : config.modelId });
  };

  const isImageSelected = (imgId: string) => config.images.some(i => i.imageId === imgId);

  const toggleModelImage = (img: ModelImage) => {
    if (isImageSelected(img.id)) {
      onChange({ ...config, images: config.images.filter(i => i.imageId !== img.id) });
    } else {
      onChange({ ...config, images: [...config.images, { imageId: img.id, filename: img.filename }] });
    }
  };

  const handleImageUpload = async (files: FileList) => {
    setIsUploadingImage(true);
    const newImages: BatchImageEntry[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          newImages.push({ imageUrl: data.url || data.path, filename: file.name });
        }
      } catch {
        // skip failed uploads
      }
    }
    if (newImages.length > 0) {
      onChange({ ...config, images: [...config.images, ...newImages], modelId: undefined });
    }
    setIsUploadingImage(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleImageUpload(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('!border-[var(--accent-border)]', '!bg-[var(--accent)]');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        const dt = new DataTransfer();
        imageFiles.forEach(f => dt.items.add(f));
        handleImageUpload(dt.files);
      }
    }
  };

  const removeImage = (index: number) => {
    onChange({ ...config, images: config.images.filter((_, i) => i !== index) });
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
            { key: 'upload' as ImageSource, label: 'Upload Images' },
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

      {/* Model + Multi-Image Picker */}
      {imageSource === 'model' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
            <select
              value={config.modelId || ''}
              onChange={(e) => onChange({ ...config, modelId: e.target.value, images: [] })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
            >
              <option value="">Select a model...</option>
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
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Select Images
                {config.images.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-white">
                    {config.images.length}
                  </span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {modelImages.map((img: ModelImage) => {
                  const selected = isImageSelected(img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggleModelImage(img)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                        selected
                          ? 'border-[var(--primary)] shadow-md'
                          : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                      }`}
                    >
                      <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                      {selected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                Click images to select/deselect. Each image = one pipeline run.
              </p>
            </div>
          )}
        </>
      )}

      {/* Direct Image Upload (multiple) */}
      {imageSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
            Upload Images
            {config.images.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-white">
                {config.images.length}
              </span>
            )}
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />

          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors ${
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
                <span className="mt-2 text-xs font-medium text-[var(--text-muted)]">Uploading...</span>
              </>
            ) : (
              <>
                <span className="text-2xl text-[var(--text-muted)]">+</span>
                <span className="mt-1 text-xs text-[var(--text-muted)]">Click or drag multiple images here</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={isUploadingImage} />
          </label>
        </div>
      )}

      {/* Selected Images Strip */}
      {config.images.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
            Selected ({config.images.length} image{config.images.length !== 1 ? 's' : ''} = {config.images.length} pipeline run{config.images.length !== 1 ? 's' : ''})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {config.images.map((img, i) => (
              <div key={i} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                {(img.imageUrl || img.imageId) && (
                  <img
                    src={img.imageUrl || modelImages.find(m => m.id === img.imageId)?.signedUrl || modelImages.find(m => m.id === img.imageId)?.gcsUrl || ''}
                    alt={img.filename || `Image ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  onClick={() => removeImage(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white transition-colors hover:bg-black/70"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Prompt</label>
        <textarea
          value={config.prompt || ''}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Describe the motion..."
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
        />
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--accent)] px-3 py-2.5">

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
