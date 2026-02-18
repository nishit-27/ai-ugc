import { Check, Expand, RefreshCw } from 'lucide-react';
import type { BatchImageEntry, BatchVideoGenConfig as BVGC, GeneratedImage } from '@/types';
import type { ExtractedFrame, FirstFrameOption } from './types';

type Progress = { done: number; total: number };

type Props = {
  config: BVGC;
  onChange: (c: BVGC) => void;
  sourceVideoUrl?: string;
  isExtracting: boolean;
  extractError: string | null;
  extractedFrames: ExtractedFrame[];
  firstFrameResults: Map<number, FirstFrameOption[]>;
  generatingIndices: Set<number>;
  isGeneratingAll: boolean;
  generateAllProgress: Progress;
  openLibraryIndex: number | null;
  libraryLoadingIndex: number | null;
  libraryImagesByIndex: Map<number, GeneratedImage[]>;
  setFirstFrameResults: (v: Map<number, FirstFrameOption[]>) => void;
  setPreviewUrl: (url: string | null) => void;
  getEntryDisplayUrl: (entry: BatchImageEntry) => string;
  handleToggleFirstFrame: (enabled: boolean) => void;
  handleExtractFrames: () => Promise<void>;
  handleGenerateAll: () => Promise<void>;
  generateFirstFrameForIndex: (index: number, images: BatchImageEntry[]) => Promise<FirstFrameOption[] | null>;
  handleSelectFirstFrameForIndex: (index: number, option: FirstFrameOption) => void;
  handleBrowseLibraryForIndex: (index: number) => Promise<void>;
  handleSelectLibraryForIndex: (index: number, img: GeneratedImage) => void;
};

export default function BatchVideoGenFirstFramesSection({
  config,
  onChange,
  sourceVideoUrl,
  isExtracting,
  extractError,
  extractedFrames,
  firstFrameResults,
  generatingIndices,
  isGeneratingAll,
  generateAllProgress,
  openLibraryIndex,
  libraryLoadingIndex,
  libraryImagesByIndex,
  setFirstFrameResults,
  setPreviewUrl,
  getEntryDisplayUrl,
  handleToggleFirstFrame,
  handleExtractFrames,
  handleGenerateAll,
  generateFirstFrameForIndex,
  handleSelectFirstFrameForIndex,
  handleBrowseLibraryForIndex,
  handleSelectLibraryForIndex,
}: Props) {
  if (config.images.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.firstFrameEnabled || false}
          onChange={(e) => handleToggleFirstFrame(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--primary)]"
        />
        <span className="text-xs font-medium text-[var(--text)]">Generate First Frames</span>
        <span className="text-[10px] text-[var(--text-muted)]">AI face swap per model image</span>
      </label>

      {config.firstFrameEnabled && (
        <div className="space-y-3 pl-5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Model</label>
              <select
                value={config.firstFrameProvider || 'gemini'}
                onChange={(e) => {
                  onChange({ ...config, firstFrameProvider: e.target.value as 'gemini' | 'fal' });
                }}
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
                onChange={(e) => {
                  const val = e.target.value as '1K' | '2K' | '4K';
                  onChange({ ...config, firstFrameResolution: val });
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">1. Pick a scene frame (shared for all)</label>
            {!sourceVideoUrl ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border)] py-4">
                <span className="text-xs text-[var(--text-muted)]">Set a source video first</span>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleExtractFrames}
                  disabled={isExtracting}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--border)] disabled:opacity-50"
                >
                  {isExtracting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-3 w-3 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--text)] animate-spin" />
                      Extracting frames...
                    </span>
                  ) : (
                    extractedFrames.length > 0 ? 'Re-extract Frames' : 'Extract Frames'
                  )}
                </button>
                {extractError && <p className="text-xs text-red-500">{extractError}</p>}
                {extractedFrames.length > 0 && (
                  <div className="grid grid-cols-4 gap-1">
                    {extractedFrames.map((frame, i) => {
                      const isSelected = config.extractedFrameUrl === frame.gcsUrl;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setFirstFrameResults(new Map());
                            onChange({ ...config, extractedFrameUrl: frame.gcsUrl });
                          }}
                          className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                            isSelected
                              ? 'border-[var(--primary)] shadow-md'
                              : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                          }`}
                        >
                          <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover" />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(frame.url);
                            }}
                            className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                          >
                            <Expand className="h-2.5 w-2.5" />
                          </div>
                          <div
                            className={`absolute left-0.5 top-0.5 rounded px-0.5 py-0 text-[9px] font-bold ${
                              frame.hasFace ? 'bg-green-500/90 text-white' : 'bg-gray-500/70 text-white'
                            }`}
                          >
                            {frame.hasFace ? `${frame.score}/10` : 'No face'}
                          </div>
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                                <Check className="h-2.5 w-2.5 text-white" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {config.images.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-[var(--text-muted)]">2. Per image: Generate or Choose from library</label>
                <button
                  onClick={handleGenerateAll}
                  disabled={isGeneratingAll || !config.extractedFrameUrl}
                  className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {isGeneratingAll ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      {generateAllProgress.done}/{generateAllProgress.total}
                    </span>
                  ) : !config.extractedFrameUrl ? (
                    'Pick scene first'
                  ) : (
                    'Generate All'
                  )}
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {config.images.map((entry, idx) => {
                  const isGenerating = generatingIndices.has(idx);
                  const options = firstFrameResults.get(idx) || [];
                  const displayUrl = getEntryDisplayUrl(entry);
                  const libraryImages = libraryImagesByIndex.get(idx) || [];
                  const isLibraryLoading = libraryLoadingIndex === idx;
                  const isGeneratedSelected = options.some((o) => o.gcsUrl === entry.imageUrl);
                  const hasFirstFrameOverride = !!(entry.originalImageId || entry.originalImageUrl);

                  return (
                    <div key={idx} className="rounded-lg border border-[var(--border)] p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <img
                          src={displayUrl}
                          alt={entry.filename || `Image ${idx + 1}`}
                          className="h-9 w-9 rounded object-cover shrink-0 cursor-pointer"
                          onClick={() => {
                            if (displayUrl) setPreviewUrl(displayUrl);
                          }}
                        />
                        <span className="text-xs text-[var(--text)] truncate flex-1">{entry.filename || `Image ${idx + 1}`}</span>
                        {isGenerating && (
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin shrink-0" />
                        )}
                        {!isGenerating && (
                          <div className="flex items-center gap-1 shrink-0">
                            {options.length === 0 ? (
                              <button
                                onClick={() => generateFirstFrameForIndex(idx, config.images)}
                                disabled={isGenerating || isGeneratingAll || !config.extractedFrameUrl}
                                className="rounded bg-[var(--primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90 disabled:opacity-50"
                              >
                                Generate
                              </button>
                            ) : (
                              <button
                                onClick={() => generateFirstFrameForIndex(idx, config.images)}
                                disabled={isGenerating || isGeneratingAll || !config.extractedFrameUrl}
                                className="flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
                              >
                                <RefreshCw className="h-2.5 w-2.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleBrowseLibraryForIndex(idx)}
                              className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                openLibraryIndex === idx
                                  ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                              }`}
                            >
                              {openLibraryIndex === idx ? 'Hide' : 'Choose'}
                            </button>
                          </div>
                        )}
                      </div>
                      {!config.extractedFrameUrl && (
                        <p className="text-[10px] text-[var(--text-muted)]">Pick shared scene to enable Generate, or use Choose directly.</p>
                      )}

                      {options.length > 0 && (
                        <div className="grid grid-cols-2 gap-1">
                          {options.map((opt, oi) => {
                            const isSelected = entry.imageUrl === opt.gcsUrl;
                            return (
                              <button
                                key={oi}
                                onClick={() => handleSelectFirstFrameForIndex(idx, opt)}
                                className={`group relative aspect-[4/3] overflow-hidden rounded border-2 transition-all duration-150 ${
                                  isSelected
                                    ? 'border-[var(--primary)] shadow-sm'
                                    : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                                }`}
                              >
                                <img src={opt.url} alt={`Option ${String.fromCharCode(65 + oi)}`} className="h-full w-full object-cover" />
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewUrl(opt.url);
                                  }}
                                  className="absolute bottom-0.5 left-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                                >
                                  <Expand className="h-2.5 w-2.5" />
                                </div>
                                {isSelected && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                                      <Check className="h-2.5 w-2.5 text-white" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute right-0.5 top-0.5 rounded bg-black/50 px-0.5 py-0 text-[8px] font-bold text-white">
                                  {String.fromCharCode(65 + oi)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {openLibraryIndex === idx && (
                        <div className="rounded border border-[var(--border)] bg-[var(--background)] p-1.5 space-y-1.5">
                          {isLibraryLoading ? (
                            <div className="flex items-center justify-center gap-2 py-3">
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--primary)] animate-spin" />
                              <span className="text-[10px] text-[var(--text-muted)]">Loading library...</span>
                            </div>
                          ) : libraryImages.length === 0 ? (
                            <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">No previous generations</p>
                          ) : (
                            <div className="grid grid-cols-3 gap-1">
                              {libraryImages.map((img) => {
                                const libDisplayUrl = img.signedUrl || img.gcsUrl;
                                const isSel = entry.imageUrl === img.gcsUrl;
                                return (
                                  <button
                                    key={img.id}
                                    onClick={() => handleSelectLibraryForIndex(idx, img)}
                                    className={`group relative aspect-[4/3] overflow-hidden rounded border-2 transition-all duration-150 ${
                                      isSel
                                        ? 'border-[var(--primary)] shadow-sm'
                                        : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                                    }`}
                                  >
                                    <img src={libDisplayUrl} alt={img.filename} className="h-full w-full object-cover" />
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewUrl(libDisplayUrl);
                                      }}
                                      className="absolute bottom-0.5 right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                                    >
                                      <Expand className="h-2 w-2" />
                                    </div>
                                    {isSel && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                                          <Check className="h-2.5 w-2.5 text-white" />
                                        </div>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {hasFirstFrameOverride && entry.imageUrl && (
                        <p className="text-[10px] text-green-600 font-medium">
                          {isGeneratedSelected ? 'Generated first frame selected' : 'Library first frame selected (direct)'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
