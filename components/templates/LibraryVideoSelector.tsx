'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AlertTriangle, Check, ChevronDown, Expand, Film, Layers, RefreshCw, Sparkles, Video, Wand2, X } from 'lucide-react';
import PreviewModal from '@/components/ui/PreviewModal';
import type { MasterModel } from './NodeConfigPanel';

type LibraryVideo = {
  url: string;
  label: string;
  category: 'generated' | 'final';
  created: string | null;
};

type PipelineStepLite = {
  id: string;
  type: string;
  label?: string;
  enabled?: boolean;
};

type TemplateJobData = {
  id: string;
  modelId?: string | null;
  pipelineBatchId?: string | null;
  status: string;
  outputUrl?: string;
  name: string;
  pipeline?: PipelineStepLite[];
  stepResults?: { stepId: string; type: string; label: string; outputUrl: string }[];
  createdAt: string;
  completedAt?: string;
};

type PipelineBatchData = {
  id: string;
  name: string;
  status: string;
  isMaster?: boolean;
  createdAt: string;
  pipeline?: PipelineStepLite[];
};

// Module-level cache so data persists across re-mounts (e.g. switching steps)
let _cachedJobs: TemplateJobData[] | null = null;
let _cachedBatches: PipelineBatchData[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const STEP_TYPE_LABELS: Record<string, string> = {
  'video-generation': 'Video Generation',
  'batch-video-generation': 'Batch Video Generation',
  'text-overlay': 'Text Overlay',
  'bg-music': 'Background Music',
  'attach-video': 'Attach Video',
  'compose': 'Compose',
  'carousel': 'Carousel',
};

function formatStepLabel(step: PipelineStepLite): string {
  if (step.label && step.label.trim()) return step.label;
  return STEP_TYPE_LABELS[step.type] || step.type;
}

function toLocalDateKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LibraryVideoSelector({
  masterModels,
  selectedModelIds,
  libraryVideos,
  onSelect,
  onRemove,
  isExpanded = false,
}: {
  masterModels: MasterModel[];
  selectedModelIds: string[];
  libraryVideos: Record<string, string>;
  onSelect: (modelId: string, gcsUrl: string) => void;
  onRemove: (modelId: string) => void;
  isExpanded?: boolean;
}) {
  const [templateJobs, setTemplateJobs] = useState<TemplateJobData[]>(_cachedJobs ?? []);
  const [pipelineBatchesState, setPipelineBatchesState] = useState<PipelineBatchData[]>(_cachedBatches ?? []);
  const [initialLoading, setInitialLoading] = useState(_cachedJobs === null);
  const [refreshingModelId, setRefreshingModelId] = useState<string | null>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Record<string, 'all' | 'generated' | 'final'>>({});

  // Quick-fill state: pick a batch + step and auto-apply per model
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const fetchJobs = useCallback(async (force = false, modelId?: string) => {
    // Use cache if fresh and not forced
    if (!force && _cachedJobs && _cachedBatches && Date.now() - _cacheTimestamp < CACHE_TTL) {
      setTemplateJobs(_cachedJobs);
      setPipelineBatchesState(_cachedBatches);
      setInitialLoading(false);
      return;
    }
    // Only show global loading on first load (no data yet)
    if (!_cachedJobs) setInitialLoading(true);
    // Track which model triggered the refresh
    if (modelId) setRefreshingModelId(modelId);
    else if (force) setRefreshingModelId('__all');
    try {
      const [jobsRes, batchesRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/pipeline-batches'),
      ]);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        const jobs = Array.isArray(data) ? data : [];
        _cachedJobs = jobs;
        setTemplateJobs(jobs);
      }
      if (batchesRes.ok) {
        const data = await batchesRes.json();
        const batches = Array.isArray(data) ? data : [];
        _cachedBatches = batches;
        setPipelineBatchesState(batches);
      }
      _cacheTimestamp = Date.now();
    } catch {
      // ignore
    } finally {
      setInitialLoading(false);
      setRefreshingModelId(null);
    }
  }, []);

  // Fetch template jobs on mount (uses cache if available)
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

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

  // ── Quick-fill: group jobs by batch, derive steps from the batch pipeline ──
  const jobsByBatch = useMemo(() => {
    const map: Record<string, TemplateJobData[]> = {};
    for (const job of templateJobs) {
      if (!job.pipelineBatchId || job.status !== 'completed' || !job.modelId) continue;
      (map[job.pipelineBatchId] ||= []).push(job);
    }
    return map;
  }, [templateJobs]);

  const filteredBatches = useMemo(() => {
    const batches = pipelineBatchesState.filter(
      (b) => b.isMaster && (jobsByBatch[b.id]?.length ?? 0) > 0
    );
    if (!filterDate) return batches;
    return batches.filter((b) => toLocalDateKey(b.createdAt) === filterDate);
  }, [pipelineBatchesState, jobsByBatch, filterDate]);

  const selectedBatch = useMemo(
    () => filteredBatches.find((b) => b.id === selectedBatchId) || null,
    [filteredBatches, selectedBatchId]
  );

  const batchJobs = useMemo(
    () => (selectedBatch ? jobsByBatch[selectedBatch.id] || [] : []),
    [selectedBatch, jobsByBatch]
  );

  const batchSteps = useMemo(() => {
    if (!selectedBatch) return [] as { stepId: string; label: string; stepNumber: number; hasOutput: boolean }[];
    const pipeline = selectedBatch.pipeline || batchJobs[0]?.pipeline || [];
    const out: { stepId: string; label: string; stepNumber: number; hasOutput: boolean }[] = [];
    let stepNumber = 0;
    for (const step of pipeline) {
      if (step.enabled === false) continue;
      stepNumber++;
      const hasOutput = batchJobs.some((j) =>
        j.stepResults?.some((sr) => sr.stepId === step.id && !!sr.outputUrl)
      );
      out.push({
        stepId: step.id,
        label: formatStepLabel(step),
        stepNumber,
        hasOutput,
      });
    }
    const hasFinal = batchJobs.some((j) => !!j.outputUrl);
    if (hasFinal) {
      out.push({
        stepId: '__final__',
        label: 'Final Output',
        stepNumber: stepNumber + 1,
        hasOutput: true,
      });
    }
    return out;
  }, [selectedBatch, batchJobs]);

  const getStepUrlForModel = useCallback(
    (modelId: string): string | null => {
      if (!selectedStepId) return null;
      const job = batchJobs.find((j) => j.modelId === modelId);
      if (!job) return null;
      if (selectedStepId === '__final__') return job.outputUrl || null;
      const sr = job.stepResults?.find((s) => s.stepId === selectedStepId && !!s.outputUrl);
      return sr?.outputUrl || null;
    },
    [batchJobs, selectedStepId]
  );

  // Reset batch when it drops out of the filtered list, and reset step when it doesn't exist
  useEffect(() => {
    if (selectedBatchId && !filteredBatches.find((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(null);
      setSelectedStepId(null);
    }
  }, [filteredBatches, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    if (selectedStepId && !batchSteps.find((s) => s.stepId === selectedStepId)) {
      setSelectedStepId(null);
    }
  }, [batchSteps, selectedBatchId, selectedStepId]);

  // Auto-apply the chosen step video to every selected model
  const libraryVideosRef = useRef(libraryVideos);
  useEffect(() => {
    libraryVideosRef.current = libraryVideos;
  }, [libraryVideos]);

  useEffect(() => {
    if (!selectedBatchId || !selectedStepId) return;
    for (const mid of selectedModelIds) {
      const url = getStepUrlForModel(mid);
      if (url && libraryVideosRef.current[mid] !== url) {
        onSelect(mid, url);
      }
    }
  }, [selectedBatchId, selectedStepId, selectedModelIds, getStepUrlForModel, onSelect]);

  const appliedInfo = useMemo(() => {
    if (!selectedBatchId || !selectedStepId) {
      return { count: 0, firstPreview: null as { url: string; modelId: string; modelName: string } | null };
    }
    let count = 0;
    let firstPreview: { url: string; modelId: string; modelName: string } | null = null;
    for (const mid of selectedModelIds) {
      const url = getStepUrlForModel(mid);
      if (url) {
        count++;
        if (!firstPreview) {
          const model = masterModels.find((m) => m.modelId === mid);
          firstPreview = { url, modelId: mid, modelName: model?.modelName || 'Model' };
        }
      }
    }
    return { count, firstPreview };
  }, [selectedBatchId, selectedStepId, selectedModelIds, masterModels, getStepUrlForModel]);

  const filteredModels = masterModels.filter((m) => selectedModelIds.includes(m.modelId));
  const selectedCount = Object.keys(libraryVideos).filter((id) => selectedModelIds.includes(id)).length;

  const hasAnyMasterBatch = pipelineBatchesState.some((b) => b.isMaster);
  const showQuickFill = filteredModels.length > 0;
  const hasAnyFilteredBatch = filteredBatches.length > 0;

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
        <div className="flex items-center gap-1.5">
          {selectedCount === selectedModelIds.length && selectedModelIds.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-master/10 px-2 py-0.5 text-[10px] font-semibold text-master dark:text-master-muted">
              <Check className="h-3 w-3" /> Ready
            </span>
          )}
          <button
            onClick={() => fetchJobs(true)}
            disabled={!!refreshingModelId}
            title="Refresh all videos"
            className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${refreshingModelId === '__all' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-master transition-all duration-300"
          style={{ width: selectedModelIds.length > 0 ? `${(selectedCount / selectedModelIds.length) * 100}%` : '0%' }}
        />
      </div>

      <div className={isExpanded ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start' : 'space-y-3'}>
      {/* Quick fill from batch */}
      {showQuickFill && (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-master-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Quick fill from batch
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[9px] font-medium text-[var(--text-muted)]">
                <span>Date</span>
                {filterDate && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFilterDate('');
                      setSelectedBatchId(null);
                      setSelectedStepId(null);
                    }}
                    title="Clear date"
                    className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9px] font-semibold text-master hover:bg-master/10"
                  >
                    <X className="h-2.5 w-2.5" />
                    Clear
                  </button>
                )}
              </span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setSelectedBatchId(null);
                  setSelectedStepId(null);
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-medium text-[var(--text-muted)]">
                Batch ({filteredBatches.length})
              </span>
              <select
                value={selectedBatchId || ''}
                onChange={(e) => {
                  setSelectedBatchId(e.target.value || null);
                  setSelectedStepId(null);
                }}
                disabled={!hasAnyFilteredBatch}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text)] disabled:opacity-40"
              >
                <option value="">
                  {hasAnyFilteredBatch
                    ? 'Choose batch…'
                    : initialLoading && !hasAnyMasterBatch
                      ? 'Loading batches…'
                      : filterDate
                        ? 'No batches on this date'
                        : hasAnyMasterBatch
                          ? 'No master batches with videos'
                          : 'No master batches yet'}
                </option>
                {filteredBatches.map((b) => {
                  const jobCount = jobsByBatch[b.id]?.length ?? 0;
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} · {formatShortDate(b.createdAt)} · {jobCount} model{jobCount !== 1 ? 's' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {selectedBatch && (
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-medium text-[var(--text-muted)]">
                Step ({batchSteps.length})
              </span>
              <select
                value={selectedStepId || ''}
                onChange={(e) => setSelectedStepId(e.target.value || null)}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text)]"
              >
                <option value="">Choose step…</option>
                {batchSteps.map((s) => (
                  <option key={s.stepId} value={s.stepId} disabled={!s.hasOutput}>
                    {s.stepId === '__final__'
                      ? `Final Output`
                      : `Step ${s.stepNumber}: ${s.label}`}
                    {s.hasOutput ? '' : ' (no output)'}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedBatch && selectedStepId && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[9px] font-medium text-[var(--text-muted)]">
                  {appliedInfo.firstPreview
                    ? `Preview · ${appliedInfo.firstPreview.modelName}`
                    : 'No preview available'}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-master/10 px-2 py-0.5 text-[9px] font-semibold text-master dark:text-master-muted">
                  <Wand2 className="h-2.5 w-2.5" />
                  Auto-applied {appliedInfo.count}/{selectedModelIds.length}
                </span>
              </div>
              {appliedInfo.firstPreview ? (
                <video
                  key={appliedInfo.firstPreview.url}
                  src={appliedInfo.firstPreview.url}
                  controls
                  muted
                  playsInline
                  className="w-full max-h-48 rounded-lg border border-[var(--border)] bg-black object-contain"
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--accent)] py-4">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    This step has no output for the selected models.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Model cards list */}
      {filteredModels.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] py-6">
          <Film className="h-5 w-5 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">Select models in the canvas panel first</span>
        </div>
      ) : initialLoading ? (
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
            const isRowExpanded = expandedModelId === model.modelId;
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
                      : isRowExpanded ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]'
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
                  {hasVideo && selectedVideoUrl && (
                    <SelectedThumbnail
                      url={signedUrls[selectedVideoUrl] || selectedVideoUrl}
                      onExpand={() => setPreviewUrl(signedUrls[selectedVideoUrl] || selectedVideoUrl)}
                    />
                  )}
                  {hasVideo && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-master shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${isRowExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded video grid */}
                {isRowExpanded && (() => {
                  const filter = categoryFilter[model.modelId] || 'all';
                  const filteredVideos = filter === 'all' ? videos
                    : filter === 'generated' ? generated
                    : finals;
                  const showGenerated = filter === 'all' || filter === 'generated';
                  const showFinals = filter === 'all' || filter === 'final';

                  return (
                    <div className="border-t border-[var(--border)] p-2.5 space-y-3 max-h-[360px] overflow-y-auto">
                      {/* Filter bar + refresh */}
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={filter}
                          onChange={(e) => setCategoryFilter((prev) => ({ ...prev, [model.modelId]: e.target.value as 'all' | 'generated' | 'final' }))}
                          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text)]"
                        >
                          <option value="all">All ({videos.length})</option>
                          <option value="generated">Generated ({generated.length})</option>
                          <option value="final">Final Output ({finals.length})</option>
                        </select>
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchJobs(true, model.modelId); }}
                          disabled={!!refreshingModelId}
                          title="Refresh videos for this model"
                          className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${refreshingModelId === model.modelId ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      </div>

                      {filteredVideos.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 py-4">
                          <Film className="h-4 w-4 text-[var(--text-muted)]" />
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {videos.length === 0 ? 'No generated videos for this model' : `No ${filter === 'generated' ? 'generated' : 'final output'} videos`}
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Generated videos (Fal / Veo raw) */}
                          {showGenerated && generated.length > 0 && (
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
                          {showFinals && finals.length > 0 && (
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
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      </div>

      {previewUrl && <PreviewModal src={previewUrl} type="video" onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}

function SelectedThumbnail({ url, onExpand }: { url: string; onExpand: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !videoRef.current) return;
    const vid = videoRef.current;
    vid.preload = 'metadata';
    vid.src = url;
    vid.load();
  }, [visible, url]);

  const handleLoaded = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.currentTime === 0 && vid.duration > 0.5) vid.currentTime = 0.5;
    vid.pause();
    setLoaded(true);
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      className="relative h-10 w-7 shrink-0 overflow-hidden rounded-md border border-master/30 bg-black cursor-pointer group/thumb"
      title="Preview"
    >
      {!errored && (
        <video
          ref={videoRef}
          className={`h-full w-full object-cover transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          muted
          playsInline
          onLoadedData={handleLoaded}
          onError={() => setErrored(true)}
        />
      )}
      {(!loaded || errored) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {errored ? (
            <AlertTriangle className="h-3 w-3 text-[var(--text-muted)]" />
          ) : (
            <Film className="h-3 w-3 text-[var(--text-muted)]/40" />
          )}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
        <Expand className="h-2.5 w-2.5 text-white" />
      </div>
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [visible, setVisible] = useState(false);

  // Lazy load: only set video src when card scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Once visible, load only metadata (first frame) instead of full video
  useEffect(() => {
    if (!visible || !videoRef.current) return;
    const vid = videoRef.current;
    vid.preload = 'metadata';
    vid.src = displayUrl;
    vid.load();
  }, [visible, displayUrl]);

  const handleLoaded = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    // Seek to 0.5s for a better thumbnail frame
    if (vid.currentTime === 0 && vid.duration > 0.5) {
      vid.currentTime = 0.5;
    }
    vid.pause();
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setErrored(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!errored && videoRef.current) {
      // Switch to full preload on hover for smooth playback
      videoRef.current.preload = 'auto';
      videoRef.current.play().catch(() => {});
    }
  }, [errored]);

  const handleMouseLeave = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const handleRetry = useCallback(() => {
    setErrored(false);
    setLoaded(false);
    if (videoRef.current) {
      videoRef.current.src = '';
      // Force reload with cache-busted URL
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.src = displayUrl;
          videoRef.current.load();
        }
      }, 100);
    }
  }, [displayUrl]);

  if (errored) {
    return (
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--accent)] flex flex-col items-center justify-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="text-[8px] text-[var(--text-muted)] text-center px-1">Unavailable</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleRetry(); }}
          className="flex items-center gap-0.5 rounded-md bg-[var(--background)] border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <RefreshCw className="h-2 w-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      ref={containerRef}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative aspect-[9/16] overflow-hidden rounded-xl border-2 transition-all duration-150 ${
        isSelected ? 'border-master shadow-md' : 'border-[var(--border)] hover:border-master-muted'
      }`}
    >
      <video
        ref={videoRef}
        className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        muted
        loop
        playsInline
        onLoadedData={handleLoaded}
        onError={handleError}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]">
          <Film className="h-4 w-4 text-[var(--text-muted)]/40" />
        </div>
      )}
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
