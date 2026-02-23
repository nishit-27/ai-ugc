import { Check, Clock, Expand, Monitor, User, Volume2, VolumeX, X } from 'lucide-react';
import Dropdown from '@/components/templates/shared/OptionDropdown';
import VideoTrimmer from '@/components/templates/shared/VideoTrimmer';
import type { BatchVideoGenConfig as BVGC, Model, ModelImage } from '@/types';
import type { ImageSource } from './types';

const VEO_DURATIONS = ['4s', '6s', '8s'];
const VEO_ASPECTS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: 'auto', label: 'Auto' },
];

type Props = {
  config: BVGC;
  onChange: (c: BVGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  masterMode?: boolean;
  imageSource: ImageSource;
  models: Model[];
  modelImages: ModelImage[];
  imagesLoading: boolean;
  isUploadingImage: boolean;
  isExpanded?: boolean;
  firstFramesSectionContent: React.ReactNode;
  setPreviewUrl: (url: string | null) => void;
  handleImageSourceChange: (src: ImageSource) => void;
  setFirstFrameResults: (v: Map<number, { url: string; gcsUrl: string }[]>) => void;
  isImageSelected: (imgId: string) => boolean;
  toggleModelImage: (img: ModelImage) => void;
  removeImage: (index: number) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
};

export default function BatchVideoGenMainColumn({
  config,
  onChange,
  sourceDuration,
  sourceVideoUrl,
  masterMode,
  imageSource,
  models,
  modelImages,
  imagesLoading,
  isUploadingImage,
  isExpanded,
  firstFramesSectionContent,
  setPreviewUrl,
  handleImageSourceChange,
  setFirstFrameResults,
  isImageSelected,
  toggleModelImage,
  removeImage,
  fileRef,
  handleFileChange,
  handleDrop,
}: Props) {
  const isMotion = config.mode === 'motion-control';
  const isSubtle = config.mode === 'subtle-animation';
  const audioOn = config.generateAudio ?? true;

  return (
    <div className="space-y-5">
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

      {masterMode ? (
        <div className="rounded-xl border border-master/20 bg-master-light dark:border-master/30 dark:bg-master-light p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-master-light dark:bg-master-light">
              <User className="h-3.5 w-3.5 text-master dark:text-master-muted" />
            </div>
            <span className="text-xs font-semibold text-master dark:text-master-muted">Auto Model Images</span>
          </div>
          <p className="text-[10px] text-master-muted/80 dark:text-master-muted/80">
            Each selected model&apos;s primary image will be used automatically.
            The batch step will be converted to individual video generation per model.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Images</label>
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

          {imageSource === 'model' && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
                <select
                  value={config.modelId || ''}
                  onChange={(e) => {
                    setFirstFrameResults(new Map());
                    onChange({ ...config, modelId: e.target.value, images: [] });
                  }}
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
                    {modelImages.map((img) => {
                      const selected = isImageSelected(img.id);
                      return (
                        <button
                          key={img.id}
                          onClick={() => toggleModelImage(img)}
                          className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                            selected
                              ? 'border-[var(--primary)] shadow-md'
                              : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                          }`}
                        >
                          <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(img.signedUrl || img.gcsUrl);
                            }}
                            className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                          >
                            <Expand className="h-2.5 w-2.5" />
                          </div>
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

          {config.images.length > 0 && !config.firstFrameEnabled && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Selected ({config.images.length} image{config.images.length !== 1 ? 's' : ''} = {config.images.length} pipeline run{config.images.length !== 1 ? 's' : ''})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {config.images.map((img, i) => (
                  <div key={i} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                    {(img.imageUrl || img.imageId) && (
                      <img
                        src={img.imageUrl || modelImages.find((m) => m.id === img.imageId)?.signedUrl || modelImages.find((m) => m.id === img.imageId)?.gcsUrl || ''}
                        alt={img.filename || `Image ${i + 1}`}
                        className="h-full w-full object-cover cursor-pointer"
                        onClick={() => setPreviewUrl(img.imageUrl || modelImages.find((m) => m.id === img.imageId)?.signedUrl || modelImages.find((m) => m.id === img.imageId)?.gcsUrl || '')}
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

          {!isExpanded && firstFramesSectionContent}
        </>
      )}

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
                  onChange={(e) => onChange({ ...config, maxSeconds: parseInt(e.target.value, 10) })}
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

      {sourceVideoUrl && sourceDuration && sourceDuration > 0 && (
        <VideoTrimmer
          videoUrl={sourceVideoUrl}
          duration={sourceDuration}
          trimStart={config.trimStart ?? 0}
          trimEnd={config.trimEnd ?? sourceDuration}
          onChange={(start, end) => onChange({ ...config, trimStart: start, trimEnd: end })}
        />
      )}
    </div>
  );
}
