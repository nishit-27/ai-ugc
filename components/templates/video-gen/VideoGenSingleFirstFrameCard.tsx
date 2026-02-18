import { Check, ChevronDown, ChevronUp, Expand, RefreshCw, Sparkles, Upload, User, X } from 'lucide-react';
import VideoGenLibraryChooser from './VideoGenLibraryChooser';
import LoadingShimmer from '@/components/ui/LoadingShimmer';
import type { GeneratedImage, VideoGenConfig as VGC } from '@/types';
import type { ExtractedFrame, FirstFrameOption } from './types';
type Props = {
  config: VGC;
  onChange: (c: VGC) => void;
  hasModelImage: boolean;
  canGenerateFirstFrame: boolean;
  isDirectLibraryFirstFrame: boolean;
  selectedFirstFramePreview: string;
  isResolvingSelectedFirstFrame: boolean;
  showLibrary: boolean;
  isLoadingLibrary: boolean;
  libraryImages: GeneratedImage[];
  showScenePicker: boolean;
  isUploadingScene: boolean;
  isExtracting: boolean;
  extractError: string | null;
  generateError: string | null;
  sourceVideoUrl?: string;
  extractedFrames: ExtractedFrame[];
  firstFrameOptions: FirstFrameOption[];
  dismissedOptions: Set<string>;
  isGeneratingFirstFrame: boolean;
  sceneDisplayUrl: string | null;
  sceneFileRef: React.RefObject<HTMLInputElement | null>;
  setShowScenePicker: (value: boolean) => void;
  setFirstFrameInputMode: (mode: 'generate' | 'direct-library') => void;
  setShowLibrary: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  onSetResolution: (resolution: '1K' | '2K' | '4K') => void;
  onToggleFirstFrame: (enabled: boolean) => void;
  onGenerateFirstFrame: () => Promise<void>;
  onBrowseLibrary: () => Promise<void>;
  onSelectLibraryImage: (img: GeneratedImage) => void;
  onSelectFirstFrame: (option: FirstFrameOption) => void;
  onSelectSceneFrame: (gcsUrl: string) => void;
  onClearSceneFrame: () => void;
  onExtractFrames: () => Promise<void>;
  onSceneFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSceneDrop: (e: React.DragEvent) => void;
  resolveModelImageDisplay: () => string | null;
};
export default function VideoGenSingleFirstFrameCard({
  config,
  onChange,
  hasModelImage,
  canGenerateFirstFrame,
  isDirectLibraryFirstFrame,
  selectedFirstFramePreview,
  isResolvingSelectedFirstFrame,
  showLibrary,
  isLoadingLibrary,
  libraryImages,
  showScenePicker,
  isUploadingScene,
  isExtracting,
  extractError,
  generateError,
  sourceVideoUrl,
  extractedFrames,
  firstFrameOptions,
  dismissedOptions,
  isGeneratingFirstFrame,
  sceneDisplayUrl,
  sceneFileRef,
  setShowScenePicker,
  setFirstFrameInputMode,
  setShowLibrary,
  setPreviewUrl,
  onSetResolution,
  onToggleFirstFrame,
  onGenerateFirstFrame,
  onBrowseLibrary,
  onSelectLibraryImage,
  onSelectFirstFrame,
  onSelectSceneFrame,
  onClearSceneFrame,
  onExtractFrames,
  onSceneFileChange,
  onSceneDrop,
  resolveModelImageDisplay,
}: Props) {
  if (!hasModelImage) return null;
  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-200 ${
        config.firstFrameEnabled
          ? 'bg-gradient-to-b from-[var(--accent)] to-[var(--background)]'
          : 'bg-[var(--accent)]/50'
      }`}
    >
      <button
        onClick={() => onToggleFirstFrame(!config.firstFrameEnabled)}
        className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--accent)]/60"
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
            config.firstFrameEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--background)]'
          }`}
        >
          <Sparkles className={`h-4 w-4 ${config.firstFrameEnabled ? 'text-[var(--primary-foreground)]' : 'text-[var(--text-muted)]'}`} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[13px] font-semibold text-[var(--text)]">First Frame</p>
          <p className="text-[10px] text-[var(--text-muted)] leading-tight">AI face swap onto a video scene</p>
        </div>
        <div className={`h-[22px] w-10 rounded-full p-0.5 transition-colors ${config.firstFrameEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--text-muted)]/20'}`}>
          <div className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${config.firstFrameEnabled ? 'translate-x-[18px]' : 'translate-x-0'}`} />
        </div>
      </button>
      {config.firstFrameEnabled && (
        <div className="px-4 pb-4 space-y-3.5">
          {isDirectLibraryFirstFrame ? (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Selected First Frame</p>
                {isResolvingSelectedFirstFrame ? (
                  <div className="relative mx-auto w-full max-w-[180px] aspect-[3/4] overflow-hidden rounded-2xl border-2 border-[var(--primary)]/30 bg-[var(--accent)]">
                    <LoadingShimmer tone="primary" />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (selectedFirstFramePreview) setPreviewUrl(selectedFirstFramePreview);
                    }}
                    className="group relative mx-auto block w-full max-w-[180px] aspect-[3/4] overflow-hidden rounded-2xl border-2 border-[var(--primary)]"
                  >
                    <img src={selectedFirstFramePreview} alt="Selected first frame" className="h-full w-full object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[var(--primary)]/90 to-transparent py-1 text-center">
                      <span className="text-[10px] font-semibold text-[var(--primary-foreground)]">Selected from library</span>
                    </div>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setFirstFrameInputMode('generate');
                    setShowLibrary(false);
                  }}
                  className="rounded-xl bg-[var(--primary)] px-3 py-2.5 text-xs font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)]"
                >
                  Generate Instead
                </button>
                <button
                  onClick={onBrowseLibrary}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                    showLibrary
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                  }`}
                >
                  {showLibrary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showLibrary ? 'Hide' : 'Change'}
                </button>
              </div>
              <VideoGenLibraryChooser
                showLibrary={showLibrary}
                isLoadingLibrary={isLoadingLibrary}
                libraryImages={libraryImages}
                modelId={config.modelId || undefined}
                selectedImageUrl={config.imageUrl || undefined}
                onSelect={onSelectLibraryImage}
                setPreviewUrl={setPreviewUrl}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Model</label>
                  <select
                    value={config.firstFrameProvider || 'gemini'}
                    onChange={(e) => onChange({ ...config, firstFrameProvider: e.target.value as 'gemini' | 'fal' })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="fal">FAL (Nano Banana)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Resolution</label>
                  <select
                    value={config.firstFrameResolution || '1K'}
                    onChange={(e) => onSetResolution(e.target.value as '1K' | '2K' | '4K')}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Face</p>
                  {(() => {
                    const faceUrl = resolveModelImageDisplay();
                    return faceUrl ? (
                      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl cursor-pointer" onClick={() => setPreviewUrl(faceUrl)}>
                        <img src={faceUrl} alt="Face" className="h-full w-full object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2 pt-5">
                          <p className="text-[10px] font-medium text-white/80">Model image</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20">
                        <User className="h-5 w-5 text-[var(--text-muted)]/30" />
                        <p className="text-[10px] text-[var(--text-muted)]">Select above</p>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Scene</p>
                  <input ref={sceneFileRef} type="file" accept="image/*" onChange={onSceneFileChange} className="hidden" />
                  {config.extractedFrameUrl ? (
                    <div className="relative w-full aspect-[3/4] overflow-hidden rounded-2xl group">
                      {(() => {
                        const selectedFrame = extractedFrames.find((f) => f.gcsUrl === config.extractedFrameUrl);
                        const displayUrl = selectedFrame?.url || sceneDisplayUrl || config.extractedFrameUrl;
                        return (
                          <img
                            src={displayUrl}
                            alt="Scene"
                            className="h-full w-full object-cover cursor-pointer"
                            onClick={() => setPreviewUrl(displayUrl)}
                          />
                        );
                      })()}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/0 group-hover:bg-black/40 transition-colors">
                        <button
                          onClick={() => setShowScenePicker(!showScenePicker)}
                          className="rounded-lg bg-white/20 px-3 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-opacity hover:bg-white/30"
                        >
                          Change
                        </button>
                        <button
                          onClick={onClearSceneFrame}
                          className="text-[9px] text-white/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white/90"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2 pt-5">
                        <p className="text-[10px] font-medium text-white/80">Scene frame</p>
                      </div>
                    </div>
                  ) : isUploadingScene || isExtracting ? (
                    <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20">
                      <span className="h-5 w-5 rounded-full border-2 border-[var(--text-muted)]/20 border-t-[var(--primary)] animate-spin" />
                    </div>
                  ) : (
                    <div
                      className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--text-muted)]/20 transition-all hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('!border-[var(--primary)]/40', '!bg-[var(--primary)]/5');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('!border-[var(--primary)]/40', '!bg-[var(--primary)]/5');
                      }}
                      onDrop={onSceneDrop}
                      onClick={() => sceneFileRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-[var(--text-muted)]/30" />
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">Upload image</span>
                      {sourceVideoUrl && (
                        <>
                          <div className="w-8 border-t border-[var(--text-muted)]/15" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (extractedFrames.length > 0) setShowScenePicker(true);
                              else onExtractFrames();
                            }}
                            className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                          >
                            Extract from video
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {showScenePicker && (extractedFrames.length > 0 || sourceVideoUrl) && (
                <div className="rounded-xl bg-[var(--background)] p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a scene frame</p>
                    <button
                      onClick={() => setShowScenePicker(false)}
                      className="rounded-md p-0.5 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {extractedFrames.length === 0 && sourceVideoUrl && (
                    <button
                      onClick={onExtractFrames}
                      disabled={isExtracting}
                      className="w-full rounded-lg bg-[var(--accent)] px-2.5 py-2 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-border)]/30 disabled:opacity-50 transition-colors"
                    >
                      {isExtracting ? 'Extracting...' : 'Extract frames from video'}
                    </button>
                  )}
                  <div className="grid grid-cols-5 gap-1.5">
                    {extractedFrames.map((frame, i) => {
                      const isSelected = config.extractedFrameUrl === frame.gcsUrl;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            onSelectSceneFrame(frame.gcsUrl);
                            setShowScenePicker(false);
                          }}
                          className={`group relative aspect-square overflow-hidden rounded-lg transition-all ${
                            isSelected ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]' : 'hover:opacity-80'
                          }`}
                        >
                          <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(frame.url);
                            }}
                            className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                          >
                            <Expand className="h-2.5 w-2.5" />
                          </div>
                          {frame.hasFace && <div className="absolute left-0.5 top-0.5 rounded-md bg-green-500/80 px-1 py-0.5 text-[7px] font-bold text-white">{frame.score}</div>}
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button onClick={onExtractFrames} disabled={isExtracting} className="flex-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                      {isExtracting ? 'Extracting...' : 'Re-extract'}
                    </button>
                    <span className="text-[10px] text-[var(--text-muted)]/30">|</span>
                    <button
                      onClick={() => {
                        sceneFileRef.current?.click();
                        setShowScenePicker(false);
                      }}
                      className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                    >
                      Upload instead
                    </button>
                  </div>
                </div>
              )}
              {extractError && <p className="text-xs text-red-500">{extractError}</p>}
              {!config.extractedFrameUrl && extractedFrames.length > 0 && !showScenePicker && (
                <div className="rounded-xl bg-[var(--background)] p-2.5 space-y-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a scene frame</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {extractedFrames.map((frame, i) => (
                      <button
                        key={i}
                        onClick={() => onSelectSceneFrame(frame.gcsUrl)}
                        className="group relative aspect-square overflow-hidden rounded-lg hover:opacity-80 transition-all"
                      >
                        <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewUrl(frame.url);
                          }}
                          className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                        >
                          <Expand className="h-2.5 w-2.5" />
                        </div>
                        {frame.hasFace && <div className="absolute left-0.5 top-0.5 rounded-md bg-green-500/80 px-1 py-0.5 text-[7px] font-bold text-white">{frame.score}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onGenerateFirstFrame}
                  disabled={!canGenerateFirstFrame || isGeneratingFirstFrame}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2.5 text-xs font-semibold text-[var(--primary-foreground)] transition-all hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:hover:bg-[var(--primary)]"
                >
                  {firstFrameOptions.length > 0 ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate
                    </>
                  )}
                </button>
                <button
                  onClick={onBrowseLibrary}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                    showLibrary
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                  }`}
                >
                  {showLibrary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showLibrary ? 'Hide' : 'Choose'}
                </button>
              </div>
              {!canGenerateFirstFrame && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  Generate needs both face + scene. Choose uses library image directly as first frame.
                </p>
              )}
              {config.extractedFrameUrl && config.imageUrl === config.extractedFrameUrl && (
                <p className="text-[10px] font-medium text-green-600">Selected scene is already set as first frame (no generation needed).</p>
              )}
              {generateError && <p className="text-xs text-red-500">{generateError}</p>}
              {isGeneratingFirstFrame && (
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--primary)]/10">
                      <LoadingShimmer tone="primary" backgroundClassName="bg-gradient-to-br from-[var(--accent)] to-[var(--primary)]/10" />
                    </div>
                  ))}
                </div>
              )}
              {firstFrameOptions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a result</p>
                  <div className="grid grid-cols-2 gap-3">
                    {firstFrameOptions.map((opt, i) => {
                      if (dismissedOptions.has(opt.gcsUrl)) return null;
                      const isSelected = config.imageUrl === opt.gcsUrl;
                      return (
                        <button
                          key={i}
                          onClick={() => onSelectFirstFrame(opt)}
                          className={`group relative w-full aspect-[3/4] overflow-hidden rounded-2xl border-2 transition-all duration-150 ${
                            isSelected ? 'border-[var(--primary)]' : 'border-transparent hover:opacity-90'
                          }`}
                        >
                          <img src={opt.url} alt={`Option ${String.fromCharCode(65 + i)}`} className="h-full w-full object-cover" />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(opt.url);
                            }}
                            className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                          >
                            <Expand className="h-2.5 w-2.5" />
                          </div>
                          <div className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[9px] font-bold text-white backdrop-blur-sm">
                            {String.fromCharCode(65 + i)}
                          </div>
                          {isSelected && (
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[var(--primary)]/90 to-transparent py-1 text-center">
                              <span className="text-[10px] font-semibold text-[var(--primary-foreground)]">Selected</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <VideoGenLibraryChooser
                showLibrary={showLibrary}
                isLoadingLibrary={isLoadingLibrary}
                libraryImages={libraryImages}
                modelId={config.modelId || undefined}
                selectedImageUrl={config.imageUrl || undefined}
                onSelect={onSelectLibraryImage}
                setPreviewUrl={setPreviewUrl}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
