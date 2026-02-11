'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, BookOpen, Trash2, PanelRightOpen, PanelRightClose, Play, Loader2 } from 'lucide-react';
import { usePresets } from '@/hooks/usePresets';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { useToast } from '@/hooks/useToast';
import PipelineBuilder from '@/components/templates/PipelineBuilder';
import NodeConfigPanel from '@/components/templates/NodeConfigPanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import type { MiniAppStep, VideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig, BatchVideoGenConfig } from '@/types';

const DRAFT_KEY = 'ai-ugc-pipeline-draft';

type PipelineDraft = {
  steps: MiniAppStep[];
  name: string;
  videoSource: 'tiktok' | 'upload';
  tiktokUrl: string;
  videoUrl: string;
  uploadedFilename: string;
  sourceDuration?: number;
  previewUrl?: string;
};

function loadDraft(): PipelineDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function TemplatesPage() {
  const router = useRouter();
  const { presets, isLoading: presetsLoading, isSaving: presetSaving, savePreset, deletePreset } = usePresets();
  const { uploadVideo, isUploading, progress } = useVideoUpload();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore draft from sessionStorage on mount
  const draft = useRef(loadDraft());

  // Pipeline state
  const [steps, setSteps] = useState<MiniAppStep[]>(() => draft.current?.steps ?? []);
  const [name, setName] = useState(() => draft.current?.name ?? '');
  const [videoSource, setVideoSource] = useState<'tiktok' | 'upload'>(() => draft.current?.videoSource ?? 'tiktok');
  const [tiktokUrl, setTiktokUrl] = useState(() => draft.current?.tiktokUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(() => draft.current?.videoUrl ?? '');
  const [uploadedFilename, setUploadedFilename] = useState(() => draft.current?.uploadedFilename ?? '');
  const [sourceDuration, setSourceDuration] = useState<number | undefined>(() => draft.current?.sourceDuration);
  const [previewUrl, setPreviewUrl] = useState(() => draft.current?.previewUrl ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  // Auto-save draft to sessionStorage on changes
  useEffect(() => {
    const d: PipelineDraft = { steps, name, videoSource, tiktokUrl, videoUrl, uploadedFilename, sourceDuration, previewUrl };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
  }, [steps, name, videoSource, tiktokUrl, videoUrl, uploadedFilename, sourceDuration, previewUrl]);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Sidebar resize + responsive
  const [panelWidth, setPanelWidth] = useState(380);
  const [panelOpen, setPanelOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      setPanelWidth(Math.max(280, Math.min(600, dragStartW.current + delta)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const handleVideoFile = useCallback(async (file: File) => {
    // Detect video duration from the file
    const objectUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      if (vid.duration && isFinite(vid.duration)) {
        setSourceDuration(Math.round(vid.duration));
      }
      URL.revokeObjectURL(objectUrl);
    };
    vid.onerror = () => URL.revokeObjectURL(objectUrl);
    vid.src = objectUrl;

    try {
      const result = await uploadVideo(file);
      if (result) {
        setVideoUrl(result.gcsUrl);
        setPreviewUrl(result.url || result.gcsUrl);
        setUploadedFilename(file.name);
      }
    } catch {
      showToast('Failed to upload video', 'error');
    }
  }, [uploadVideo, showToast]);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleVideoFile(file);
  };

  const handleUpdateStep = (id: string, updated: MiniAppStep) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleRemoveStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleLoadPreset = (pipeline: MiniAppStep[]) => {
    // Generate new IDs so each load is independent
    const newSteps = pipeline.map((s) => ({
      ...s,
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    setSteps(newSteps);
    setShowPresets(false);
    setSelectedNodeId(null);
    showToast('Preset loaded!', 'success');
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      showToast('Enter a preset name', 'error');
      return;
    }
    if (steps.length === 0) {
      showToast('Add pipeline steps first', 'error');
      return;
    }
    try {
      await savePreset(presetName.trim(), steps);
      setShowSavePreset(false);
      setPresetName('');
      showToast('Preset saved!', 'success');
    } catch {
      showToast('Failed to save preset', 'error');
    }
  };

  const handleRun = async () => {
    const enabledSteps = steps.filter((s) => s.enabled);
    if (enabledSteps.length === 0) {
      showToast('Add at least one pipeline step', 'error');
      return;
    }

    const firstStep = enabledSteps[0];
    const needsInputVideo = !(
      (firstStep.type === 'video-generation' && (firstStep.config as { mode?: string }).mode === 'subtle-animation') ||
      (firstStep.type === 'batch-video-generation' && (firstStep.config as { mode?: string }).mode === 'subtle-animation')
    );

    if (needsInputVideo) {
      if (videoSource === 'tiktok' && !tiktokUrl) {
        showToast('Enter a TikTok URL', 'error');
        setSelectedNodeId('source');
        return;
      }
      if (videoSource === 'upload' && !videoUrl) {
        showToast('Upload a video first', 'error');
        setSelectedNodeId('source');
        return;
      }
    }

    // Validate each enabled step has required fields
    const errors = new Map<string, string>();
    for (const s of enabledSteps) {
      switch (s.type) {
        case 'video-generation': {
          const c = s.config as VideoGenConfig;
          if (!c.imageId && !c.imageUrl) errors.set(s.id, 'Select a model image');
          break;
        }
        case 'batch-video-generation': {
          const c = s.config as BatchVideoGenConfig;
          if (!c.images || c.images.length === 0) errors.set(s.id, 'Select at least one image');
          break;
        }
        case 'text-overlay': {
          const c = s.config as TextOverlayConfig;
          if (!c.text?.trim()) errors.set(s.id, 'Enter overlay text');
          break;
        }
        case 'bg-music': {
          const c = s.config as BgMusicConfig;
          if (!c.trackId && !c.customTrackUrl) errors.set(s.id, 'Select a music track');
          break;
        }
        case 'attach-video': {
          const c = s.config as AttachVideoConfig;
          if (!c.videoUrl && !c.sourceStepId && !c.tiktokUrl) errors.set(s.id, 'Add a video source');
          break;
        }
      }
    }
    if (errors.size > 0) {
      setValidationErrors(errors);
      const first = errors.entries().next().value;
      if (first) setSelectedNodeId(first[0]);
      showToast(`${errors.size} step${errors.size > 1 ? 's' : ''} need${errors.size === 1 ? 's' : ''} configuration`, 'error');
      return;
    }
    setValidationErrors(new Map());

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Template ${new Date().toLocaleTimeString()}`,
          pipeline: steps,
          videoSource,
          tiktokUrl: videoSource === 'tiktok' ? tiktokUrl : undefined,
          videoUrl: videoSource === 'upload' ? videoUrl : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create template job');
      }

      const data = await res.json();
      const isBatch = data.isBatch === true;
      // Store new job so /jobs page shows it instantly (only for single pipelines)
      if (!isBatch) {
        try {
          sessionStorage.setItem('ai-ugc-new-job', JSON.stringify(data));
        } catch {}
      }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      showToast(isBatch ? `Batch started with ${data.totalJobs} pipeline runs!` : 'Pipeline started!', 'success');
      router.push(isBatch ? '/jobs?tab=batch' : '/jobs');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start pipeline', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="-m-8">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Templates</h1>
          <p className="text-xs text-[var(--text-muted)]">Build multi-step video pipelines</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Grouped toolbar */}
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl">
            <button
              onClick={() => setShowPresets(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--accent)] rounded-l-lg"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Presets</span>
            </button>
            <div className="h-5 w-px bg-[var(--border)]" />
            <button
              onClick={() => setShowSavePreset(true)}
              disabled={steps.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--accent)] disabled:opacity-40 disabled:pointer-events-none"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <div className="h-5 w-px bg-[var(--border)]" />
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--accent)] rounded-r-lg"
            >
              {panelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Panel</span>
            </button>
          </div>

          {/* Run button — separate, prominent */}
          <button
            onClick={handleRun}
            disabled={isSubmitting || steps.filter((s) => s.enabled).length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            Run
          </button>
        </div>
      </div>

      {/* Main area: Canvas + Config Panel */}
      <div className="flex" style={{ height: 'calc(100vh - 7.5rem)' }}>
        {/* Left: Flow canvas */}
        <div className="relative flex-1">
          <PipelineBuilder
            steps={steps}
            onChange={setSteps}
            selectedId={selectedNodeId}
            onSelect={(id) => { setSelectedNodeId(id); if (isMobile && id) setPanelOpen(true); }}
            videoSource={videoSource}
            tiktokUrl={tiktokUrl}
            videoUrl={videoUrl}
            validationErrors={validationErrors}
          />
        </div>

        {/* Right: Config Panel (resizable) */}
        {panelOpen && (
          <>
            {/* Mobile overlay backdrop */}
            {isMobile && (
              <div
                className="fixed inset-0 z-30 bg-black/30"
                onClick={() => setPanelOpen(false)}
              />
            )}

            <div
              className={`relative shrink-0 ${
                isMobile
                  ? 'fixed right-0 top-0 z-40 h-full w-[85vw] max-w-[420px] shadow-2xl'
                  : 'my-3 mr-3 overflow-hidden overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-lg'
              }`}
              style={isMobile ? undefined : { width: panelWidth }}
            >
              {/* Drag handle — slim pill slider */}
              {!isMobile && (
                <div
                  onMouseDown={onDragStart}
                  className="absolute left-0 top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
                  style={{ marginLeft: -8 }}
                >
                  <div className="h-8 w-1 rounded-full bg-[var(--text-muted)]/30 transition-colors hover:bg-[var(--text-muted)]/60" />
                </div>
              )}

              <input ref={fileRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
              <NodeConfigPanel
                selectedId={selectedNodeId}
                steps={steps}
                onUpdateStep={(id, updated) => { handleUpdateStep(id, updated); setValidationErrors((prev) => { const next = new Map(prev); next.delete(id); return next; }); }}
                onRemoveStep={handleRemoveStep}
                onClose={() => { setSelectedNodeId(null); if (isMobile) setPanelOpen(false); }}
                validationError={selectedNodeId && selectedNodeId !== 'source' ? validationErrors.get(selectedNodeId) : undefined}
                sourceConfig={{
                  videoSource,
                  tiktokUrl,
                  videoUrl,
                  previewUrl,
                  uploadedFilename,
                  isUploading,
                  uploadProgress: progress,
                  onVideoSourceChange: setVideoSource,
                  onTiktokUrlChange: setTiktokUrl,
                  onVideoUpload: (e) => handleVideoUpload(e),
                  onVideoRemove: () => { setVideoUrl(''); setPreviewUrl(''); setUploadedFilename(''); setSourceDuration(undefined); },
                  onFileDrop: handleVideoFile,
                }}
                videoUrl={previewUrl || undefined}
                sourceDuration={sourceDuration}
              />
            </div>
          </>
        )}
      </div>

      {/* Presets Modal */}
      <Modal open={showPresets} onClose={() => setShowPresets(false)} title="Pipeline Presets">
        <div className="p-4">
          {presetsLoading && presets.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
              <span className="text-sm text-[var(--text-muted)]">Loading presets...</span>
            </div>
          ) : presets.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              No saved presets yet. Build a pipeline and click &ldquo;Save&rdquo; to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--background)]"
                >
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleLoadPreset(preset.pipeline)}>
                    <div className="text-sm font-medium">{preset.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {preset.pipeline.length} step{preset.pipeline.length !== 1 ? 's' : ''}
                      {preset.description && ` — ${preset.description}`}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {preset.pipeline.map((s, i) => (
                        <span key={i} className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[9px] capitalize text-[var(--text-muted)]">
                          {s.type.replace('-', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Save Preset Modal */}
      <Modal open={showSavePreset} onClose={() => setShowSavePreset(false)} title="Save as Preset">
        <div className="p-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Preset Name</label>
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="My UGC Pipeline"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
            />
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            This will save the current {steps.length} step{steps.length !== 1 ? 's' : ''} as a reusable preset.
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowSavePreset(false)} disabled={presetSaving} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
            <button onClick={handleSavePreset} disabled={presetSaving} className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-70">
              {presetSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {presetSaving ? 'Saving...' : 'Save Preset'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
