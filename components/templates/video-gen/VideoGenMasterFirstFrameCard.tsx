import { Check, Sparkles, X } from 'lucide-react';
import type { VideoGenConfig as VGC } from '@/types';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import type { ExtractedFrame, FirstFrameOption } from './types';

type Props = {
  config: VGC;
  onChange: (c: VGC) => void;
  sourceVideoUrl?: string;
  masterModels?: MasterModel[];
  isExpanded?: boolean;
  isExtracting: boolean;
  showScenePicker: boolean;
  sceneDisplayUrl: string | null;
  extractedFrames: ExtractedFrame[];
  isMasterGeneratingAll: boolean;
  masterProgress: { done: number; total: number };
  masterPerModelResults: Record<string, FirstFrameOption[]>;
  masterPerModelContent: React.ReactNode;
  setShowScenePicker: (value: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setMasterPerModelResults: (value: Record<string, FirstFrameOption[]>) => void;
  handleExtractFrames: () => Promise<void>;
  handleMasterGenerateAll: () => Promise<void>;
};

export default function VideoGenMasterFirstFrameCard({
  config,
  onChange,
  sourceVideoUrl,
  masterModels,
  isExpanded,
  isExtracting,
  showScenePicker,
  sceneDisplayUrl,
  extractedFrames,
  isMasterGeneratingAll,
  masterProgress,
  masterPerModelResults,
  masterPerModelContent,
  setShowScenePicker,
  setPreviewUrl,
  setMasterPerModelResults,
  handleExtractFrames,
  handleMasterGenerateAll,
}: Props) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-master-light to-[var(--background)] dark:from-master-light dark:to-[var(--background)]">
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-master">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[var(--text)]">First Frame</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {masterModels && masterModels.length > 0
              ? `AI face swap for ${masterModels.length} model${masterModels.length !== 1 ? 's' : ''}`
              : 'Select models in the panel first'}
          </p>
        </div>
      </div>

      {masterModels && masterModels.length > 0 && (
        <div className="px-4 pb-4 space-y-3.5">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Scene Frame</p>
            {isExtracting ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-4 justify-center">
                <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                <span className="text-xs text-[var(--text-muted)]">Extracting best frame...</span>
              </div>
            ) : config.extractedFrameUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {(() => {
                    const selectedFrame = extractedFrames.find((frame) => frame.gcsUrl === config.extractedFrameUrl);
                    const displayUrl = selectedFrame?.url || sceneDisplayUrl || config.extractedFrameUrl;
                    return (
                      <div
                        className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] cursor-pointer"
                        onClick={() => setPreviewUrl(displayUrl)}
                      >
                        <img src={displayUrl} alt="Scene" className="h-full w-full object-cover" />
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text)]">Best frame selected</p>
                    <button
                      onClick={() => {
                        if (extractedFrames.length === 0 && sourceVideoUrl && !isExtracting) handleExtractFrames();
                        setShowScenePicker(!showScenePicker);
                      }}
                      className="text-[10px] text-master dark:text-master-muted hover:underline"
                    >
                      Change frame
                    </button>
                  </div>
                </div>
              </div>
            ) : !sourceVideoUrl ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-4 justify-center">
                <span className="text-xs text-[var(--text-muted)]">Set a source video first</span>
              </div>
            ) : (
              <button
                onClick={handleExtractFrames}
                disabled={isExtracting}
                className="w-full rounded-lg bg-master-light dark:bg-master-light px-3 py-2 text-xs font-medium text-master dark:text-master-muted hover:bg-master-light/80 dark:hover:bg-master-light/80 transition-colors disabled:opacity-50"
              >
                Extract frames from video
              </button>
            )}

            {showScenePicker && (
              <div className="mt-2 rounded-xl bg-[var(--background)] p-2.5 space-y-2 border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)]">Pick a scene frame</p>
                  <button onClick={() => setShowScenePicker(false)} className="rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {isExtracting ? (
                  <div className="flex items-center justify-center gap-2 py-6">
                    <span className="h-4 w-4 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
                    <span className="text-xs text-[var(--text-muted)]">Extracting frames...</span>
                  </div>
                ) : extractedFrames.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-1.5">
                      {extractedFrames.map((frame, i) => {
                        const isSelected = config.extractedFrameUrl === frame.gcsUrl;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setMasterPerModelResults({});
                              onChange({ ...config, extractedFrameUrl: frame.gcsUrl, masterFirstFrames: undefined });
                              setShowScenePicker(false);
                            }}
                            className={`group relative aspect-square overflow-hidden rounded-lg transition-all ${isSelected ? 'ring-2 ring-master ring-offset-1' : 'hover:opacity-80'}`}
                          >
                            <img src={frame.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover rounded-lg" />
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
                    <button onClick={handleExtractFrames} disabled={isExtracting} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]">
                      Re-extract
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleExtractFrames}
                    className="w-full rounded-lg bg-master-light px-3 py-2 text-xs font-medium text-master hover:bg-master-light/80 transition-colors"
                  >
                    Extract frames from video
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Model</label>
              <select
                value={config.firstFrameProvider || 'gemini'}
                onChange={(e) => onChange({ ...config, firstFrameProvider: e.target.value as 'gemini' | 'fal' })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--text)] focus:outline-none"
              >
                <option value="gemini">Gemini</option>
                <option value="fal">FAL (Nano Banana)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Resolution</label>
              <select
                value={config.firstFrameResolution || '1K'}
                onChange={(e) => onChange({ ...config, firstFrameResolution: e.target.value as '1K' | '2K' | '4K' })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--text)] focus:outline-none"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
          </div>

          {config.extractedFrameUrl && (
            <button
              onClick={handleMasterGenerateAll}
              disabled={isMasterGeneratingAll || !masterModels || masterModels.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-master px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-master/90 active:scale-[0.98] disabled:opacity-50"
            >
              {isMasterGeneratingAll ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating {masterProgress.done}/{masterProgress.total}
                </>
              ) : Object.keys(masterPerModelResults).length > 0 ? (
                'Regenerate All First Frames'
              ) : (
                `Generate First Frame for All (${masterModels.length})`
              )}
            </button>
          )}

          {!isExpanded && masterPerModelContent}
        </div>
      )}
    </div>
  );
}
