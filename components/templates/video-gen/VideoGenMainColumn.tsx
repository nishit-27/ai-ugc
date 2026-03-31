import { ChevronDown, ChevronUp, Clock, Monitor, Volume2, VolumeX, X } from 'lucide-react';
import Dropdown from '@/components/templates/shared/OptionDropdown';
import VideoTrimmer from '@/components/templates/shared/VideoTrimmer';
import VideoGenMasterFirstFrameCard from './VideoGenMasterFirstFrameCard';
import type { Model, ModelImage, VideoGenConfig as VGC } from '@/types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import type { ExtractedFrame, FirstFrameOption, ImageSource, QueueState } from './types';
import { VEO_ASPECTS, VEO_DURATIONS } from './types';

type Props = {
  config: VGC;
  onChange: (c: VGC) => void;
  sourceDuration?: number;
  sourceVideoUrl?: string;
  masterMode?: boolean;
  masterModels?: MasterModel[];
  isExpanded?: boolean;
  imageSource: ImageSource;
  models: Model[];
  modelImages: ModelImage[];
  imagesLoading: boolean;
  showImageGrid: boolean;
  isUploadingImage: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  extractedFrames: ExtractedFrame[];
  isExtracting: boolean;
  showScenePicker: boolean;
  sceneDisplayUrl: string | null;
  isMasterGeneratingAll: boolean;
  masterProgress: { done: number; total: number };
  masterPerModelResults: Record<string, FirstFrameOption[]>;
  masterQueueState?: QueueState;
  firstFrameCardContent: React.ReactNode;
  masterPerModelContent: React.ReactNode;
  uploadedModelPreviewUrl: string | null;
  setShowImageGrid: (value: boolean) => void;
  setShowScenePicker: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setMasterPerModelResults: (value: Record<string, FirstFrameOption[]>) => void;
  onClearOriginalModelImageUrl: () => void;
  clearFirstFrameOptions: () => void;
  handleImageSourceChange: (src: ImageSource) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleExtractFrames: () => Promise<void>;
  handleMasterGenerateAll: () => Promise<void>;
  handleSceneUpload: (file: File) => Promise<void>;
  isUploadingScene: boolean;
};

export default function VideoGenMainColumn({
  config,
  onChange,
  sourceDuration,
  sourceVideoUrl,
  masterMode,
  masterModels,
  isExpanded,
  imageSource,
  models,
  modelImages,
  imagesLoading,
  showImageGrid,
  isUploadingImage,
  fileRef,
  extractedFrames,
  isExtracting,
  showScenePicker,
  sceneDisplayUrl,
  isMasterGeneratingAll,
  masterProgress,
  masterPerModelResults,
  masterQueueState,
  firstFrameCardContent,
  masterPerModelContent,
  uploadedModelPreviewUrl,
  setShowImageGrid,
  setShowScenePicker,
  setPreviewUrl,
  setMasterPerModelResults,
  onClearOriginalModelImageUrl,
  clearFirstFrameOptions,
  handleImageSourceChange,
  handleFileChange,
  handleDrop,
  handleExtractFrames,
  handleMasterGenerateAll,
  handleSceneUpload,
  isUploadingScene,
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
        <VideoGenMasterFirstFrameCard
          config={config}
          onChange={onChange}
          sourceVideoUrl={sourceVideoUrl}
          masterModels={masterModels}
          isExpanded={isExpanded}
          isExtracting={isExtracting}
          showScenePicker={showScenePicker}
          sceneDisplayUrl={sceneDisplayUrl}
          extractedFrames={extractedFrames}
          isMasterGeneratingAll={isMasterGeneratingAll}
          masterProgress={masterProgress}
          masterPerModelResults={masterPerModelResults}
          masterPerModelContent={masterPerModelContent}
          masterQueueState={masterQueueState}
          isUploadingScene={isUploadingScene}
          setShowScenePicker={setShowScenePicker}
          setPreviewUrl={setPreviewUrl}
          setMasterPerModelResults={setMasterPerModelResults}
          handleExtractFrames={handleExtractFrames}
          handleMasterGenerateAll={handleMasterGenerateAll}
          handleSceneUpload={handleSceneUpload}
        />
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Image (face reference)</label>
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
      )}

      {!masterMode && imageSource === 'model' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model</label>
            <select
              value={config.modelId || ''}
              onChange={(e) => {
                clearFirstFrameOptions();
                onClearOriginalModelImageUrl();
                setShowImageGrid(true);
                onChange({ ...config, modelId: e.target.value, imageId: undefined, imageUrl: undefined });
              }}
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
              {config.imageId && !showImageGrid && (() => {
                const selectedImage = modelImages.find((m) => m.id === config.imageId);
                if (!selectedImage) return null;
                return (
                  <button
                    onClick={() => setShowImageGrid(true)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 transition-colors hover:bg-[var(--accent)]"
                  >
                    <img
                      src={selectedImage.signedUrl || selectedImage.gcsUrl}
                      alt={selectedImage.filename}
                      className="h-10 w-10 rounded-lg object-cover border border-[var(--primary)] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewUrl(selectedImage.signedUrl || selectedImage.gcsUrl);
                      }}
                    />
                    <div className="flex-1 text-left">
                      <p className="text-xs font-medium text-[var(--text)]">{selectedImage.filename}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Click to change</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  </button>
                );
              })()}

              {(showImageGrid || !config.imageId) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Image</label>
                    {config.imageId && (
                      <button
                        onClick={() => setShowImageGrid(false)}
                        className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                      >
                        Collapse <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {modelImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => {
                          clearFirstFrameOptions();
                          onClearOriginalModelImageUrl();
                          setShowImageGrid(false);
                          onChange({ ...config, imageId: img.id, imageUrl: undefined });
                        }}
                        className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                          config.imageId === img.id
                            ? 'border-[var(--primary)] shadow-md'
                            : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                        }`}
                      >
                        <img src={img.signedUrl || img.gcsUrl} alt={img.filename} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!masterMode && imageSource === 'upload' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Image</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

          {(uploadedModelPreviewUrl || config.imageUrl) && !config.firstFrameEnabled ? (
            <div className="relative">
              <img
                src={config.imageUrl || uploadedModelPreviewUrl || ''}
                alt="Uploaded"
                className="max-h-36 w-full rounded-xl border border-[var(--border)] object-contain bg-[var(--background)] p-1 cursor-pointer"
                onClick={() => {
                  if (config.imageUrl) setPreviewUrl(config.imageUrl);
                }}
              />
              <button
                onClick={() => {
                  onClearOriginalModelImageUrl();
                  clearFirstFrameOptions();
                  onChange({ ...config, imageUrl: undefined });
                }}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : !config.firstFrameEnabled ? (
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
          ) : (
            (uploadedModelPreviewUrl || config.imageUrl) && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
                <img
                  src={uploadedModelPreviewUrl || config.imageUrl || ''}
                  alt="Model face"
                  className="h-10 w-10 rounded object-cover cursor-pointer"
                  onClick={() => setPreviewUrl(uploadedModelPreviewUrl || config.imageUrl || '')}
                />
                <span className="text-xs text-[var(--text-muted)]">Face reference image</span>
              </div>
            )
          )}
        </div>
      )}

      {!isExpanded && firstFrameCardContent}

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
