'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, ChevronDown, Expand, Film, Sparkles, Video } from 'lucide-react';
import PreviewModal from '@/components/ui/PreviewModal';
import type { MasterModel } from './NodeConfigPanel';

type LibraryVideo = {
  url: string;
  label: string;
  category: 'generated' | 'final';
  created: string | null;
};

type TemplateJobData = {
  id: string;
  modelId?: string | null;
  status: string;
  outputUrl?: string;
  name: string;
  stepResults?: { stepId: string; type: string; label: string; outputUrl: string }[];
  createdAt: string;
  completedAt?: string;
};

export default function LibraryVideoSelector({
  masterModels,
  selectedModelIds,
  libraryVideos,
  onSelect,
  onRemove,
}: {
  masterModels: MasterModel[];
  selectedModelIds: string[];
  libraryVideos: Record<string, string>;
  onSelect: (modelId: string, gcsUrl: string) => void;
  onRemove: (modelId: string) => void;
}) {
  const [templateJobs, setTemplateJobs] = useState<TemplateJobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Fetch template jobs once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/templates');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTemplateJobs(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build per-model video lists
  const videosByModel = useMemo(() => {
    const map: Record<string, LibraryVideo[]> = {};

    for (const job of templateJobs) {
      if (job.status !== 'completed' || !job.modelId) continue;
      const modelId = job.modelId;
      if (!map[modelId]) map[modelId] = [];
      const seen = new Set(map[modelId].map((v) => v.url));

      // Video-generation step results (Fal / Veo raw)
      if (job.stepResults) {
        for (const sr of job.stepResults) {
          if (sr.type === 'video-generation' && sr.outputUrl && !seen.has(sr.outputUrl)) {
            seen.add(sr.outputUrl);
            map[modelId].push({
              url: sr.outputUrl,
              label: sr.label || 'Generated video',
              category: 'generated',
              created: job.completedAt || job.createdAt,
            });
          }
        }
      }

      // Final pipeline output
      if (job.outputUrl && !seen.has(job.outputUrl)) {
        seen.add(job.outputUrl);
        map[modelId].push({
          url: job.outputUrl,
          label: 'Final output',
          category: 'final',
          created: job.completedAt || job.createdAt,
        });
      }
    }

    for (const modelId in map) {
      map[modelId].sort((a, b) => {
        const da = a.created ? new Date(a.created).getTime() : 0;
        const db = b.created ? new Date(b.created).getTime() : 0;
        return db - da;
      });
    }

    return map;
  }, [templateJobs]);

  // URLs are now R2 public — populate signedUrls directly
  useEffect(() => {
    if (!expandedModelId) return;
    const videos = videosByModel[expandedModelId];
    if (!videos) return;
    const updates: Record<string, string> = {};
    for (const v of videos) {
      if (v.url && !signedUrls[v.url]) updates[v.url] = v.url;
    }
    if (Object.keys(updates).length > 0) {
      setSignedUrls((prev) => ({ ...prev, ...updates }));
    }
  }, [expandedModelId, videosByModel, signedUrls]);

  const filteredModels = masterModels.filter((m) => selectedModelIds.includes(m.modelId));
  const selectedCount = Object.keys(libraryVideos).filter((id) => selectedModelIds.includes(id)).length;

  const toggleExpand = (modelId: string) => {
    setExpandedModelId((prev) => (prev === modelId ? null : modelId));
  };

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center justify-between rounded-xl bg-master-light px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-master">
            <Film className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-[var(--text)]">
            {selectedCount} of {selectedModelIds.length} videos picked
          </span>
        </div>
        {selectedCount === selectedModelIds.length && selectedModelIds.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-master/10 px-2 py-0.5 text-[10px] font-semibold text-master dark:text-master-muted">
            <Check className="h-3 w-3" /> Ready
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-master transition-all duration-300"
          style={{ width: selectedModelIds.length > 0 ? `${(selectedCount / selectedModelIds.length) * 100}%` : '0%' }}
        />
      </div>

      {/* Model cards list */}
      {filteredModels.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-6">
          <Film className="h-5 w-5 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">Select models in the canvas panel first</span>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] py-8">
          <span className="h-5 w-5 rounded-full border-2 border-[var(--text-muted)]/30 border-t-master animate-spin" />
          <span className="text-xs text-[var(--text-muted)]">Loading videos...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredModels.map((model) => {
            const videos = videosByModel[model.modelId] || [];
            const generated = videos.filter((v) => v.category === 'generated');
            const finals = videos.filter((v) => v.category === 'final');
            const hasVideo = !!libraryVideos[model.modelId];
            const isExpanded = expandedModelId === model.modelId;
            const selectedVideoUrl = libraryVideos[model.modelId];

            return (
              <div key={model.modelId} className={`rounded-xl border overflow-hidden transition-colors ${
                hasVideo ? 'border-master/30 bg-master-light' : 'border-[var(--border)]'
              }`}>
                {/* Model row */}
                <button
                  onClick={() => toggleExpand(model.modelId)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 transition-colors ${
                    hasVideo
                      ? 'bg-master-light'
                      : isExpanded ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]'
                  }`}
                >
                  <img
                    src={model.primaryImageUrl}
                    alt={model.modelName}
                    className={`h-9 w-9 rounded-lg object-cover shrink-0 border ${
                      hasVideo ? 'border-master/30' : 'border-[var(--border)]'
                    }`}
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-[var(--text)] truncate">{model.modelName}</p>
                    {hasVideo ? (
                      <p className="text-[10px] font-medium text-master dark:text-master-muted">Video selected</p>
                    ) : videos.length > 0 ? (
                      <p className="text-[10px] text-[var(--text-muted)]">{videos.length} video{videos.length !== 1 ? 's' : ''} available</p>
                    ) : (
                      <p className="text-[10px] text-[var(--text-muted)]">No videos yet</p>
                    )}
                  </div>
                  {hasVideo && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-master shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded video grid */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-2.5 space-y-3 max-h-[320px] overflow-y-auto">
                    {videos.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 py-4">
                        <Film className="h-4 w-4 text-[var(--text-muted)]" />
                        <span className="text-[10px] text-[var(--text-muted)]">No generated videos for this model</span>
                      </div>
                    ) : (
                      <>
                        {/* Generated videos (Fal / Veo raw) */}
                        {generated.length > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-master-foreground" />
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                Generated ({generated.length})
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {generated.map((video) => (
                                <VideoCard
                                  key={video.url}
                                  video={video}
                                  isSelected={selectedVideoUrl === video.url}
                                  displayUrl={signedUrls[video.url] || video.url}
                                  onSelect={() => {
                                    if (selectedVideoUrl === video.url) onRemove(model.modelId);
                                    else onSelect(model.modelId, video.url);
                                  }}
                                  onPreview={() => setPreviewUrl(signedUrls[video.url] || video.url)}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Final pipeline outputs */}
                        {finals.length > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <Video className="h-3 w-3 text-master-foreground" />
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                                Final Output ({finals.length})
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {finals.map((video) => (
                                <VideoCard
                                  key={video.url}
                                  video={video}
                                  isSelected={selectedVideoUrl === video.url}
                                  displayUrl={signedUrls[video.url] || video.url}
                                  onSelect={() => {
                                    if (selectedVideoUrl === video.url) onRemove(model.modelId);
                                    else onSelect(model.modelId, video.url);
                                  }}
                                  onPreview={() => setPreviewUrl(signedUrls[video.url] || video.url)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewUrl && <PreviewModal src={previewUrl} type="video" onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}

function VideoCard({
  video,
  isSelected,
  displayUrl,
  onSelect,
  onPreview,
}: {
  video: LibraryVideo;
  isSelected: boolean;
  displayUrl: string;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group relative aspect-[9/16] overflow-hidden rounded-xl border-2 transition-all duration-150 ${
        isSelected ? 'border-master shadow-md' : 'border-[var(--border)] hover:border-master-muted'
      }`}
    >
      <video
        src={displayUrl}
        className="h-full w-full object-cover bg-black"
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
      />
      {/* Expand button */}
      <div
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
      >
        <Expand className="h-2.5 w-2.5" />
      </div>
      {/* Selection overlay */}
      {isSelected && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-master/90 to-transparent py-1 text-center">
          <span className="text-[10px] font-semibold text-white">Selected</span>
        </div>
      )}
      {/* Date */}
      {!isSelected && video.created && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
          <span className="text-[9px] text-white/70">
            {new Date(video.created).toLocaleDateString()}
          </span>
        </div>
      )}
    </button>
  );
}
