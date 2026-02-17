'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePresets } from '@/hooks/usePresets';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { useToast } from '@/hooks/useToast';
import PipelineBuilder from '@/components/templates/PipelineBuilder';
import NodeConfigPanel from '@/components/templates/NodeConfigPanel';
import type { MasterModel } from '@/components/templates/NodeConfigPanel';
import MasterCanvasPanel from '@/components/templates/MasterCanvasPanel';
import MasterPipelineHeader from '@/components/templates/master-pipeline/MasterPipelineHeader';
import MasterPipelinePresetModals from '@/components/templates/master-pipeline/MasterPipelinePresetModals';
import type { MiniAppStep, TextOverlayConfig, BgMusicConfig, AttachVideoConfig, Model } from '@/types';

const MASTER_DRAFT_KEY = 'ai-ugc-master-pipeline-draft';

type MasterDraft = {
  steps: MiniAppStep[];
  name: string;
  videoSource: 'tiktok' | 'upload';
  tiktokUrl: string;
  videoUrl: string;
  uploadedFilename: string;
  sourceDuration?: number;
  previewUrl?: string;
};

function loadDraft(): MasterDraft | null {
  try {
    const raw = sessionStorage.getItem(MASTER_DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function MasterPipelinePage() {
  const router = useRouter();
  const { presets, isLoading: presetsLoading, isSaving: presetSaving, savePreset, deletePreset } = usePresets();
  const { uploadVideo, isUploading, progress } = useVideoUpload();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const draft = useRef(loadDraft());

  // Pipeline state
  const [steps, setSteps] = useState<MiniAppStep[]>(() => draft.current?.steps ?? []);
  const [name] = useState(() => draft.current?.name ?? '');
  const [videoSource, setVideoSource] = useState<'tiktok' | 'upload'>(() => draft.current?.videoSource ?? 'tiktok');
  const [tiktokUrl, setTiktokUrl] = useState(() => draft.current?.tiktokUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(() => draft.current?.videoUrl ?? '');
  const [uploadedFilename, setUploadedFilename] = useState(() => draft.current?.uploadedFilename ?? '');
  const [sourceDuration, setSourceDuration] = useState<number | undefined>(() => draft.current?.sourceDuration);
  const [previewUrl, setPreviewUrl] = useState(() => draft.current?.previewUrl ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingPreview, setIsResolvingPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  // Master-specific state
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [masterCaption, setMasterCaption] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'queue' | 'draft'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [masterTimezone, setMasterTimezone] = useState('Asia/Kolkata');
  const [accountCounts, setAccountCounts] = useState<Record<string, number>>({});
  const [modelPrimaryImages, setModelPrimaryImages] = useState<Record<string, { signedUrl: string; gcsUrl: string }>>({});

  // Load models + primary images + account counts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/models', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const models: Model[] = Array.isArray(data) ? data : data.models || [];

        const counts: Record<string, number> = {};
        const images: Record<string, { signedUrl: string; gcsUrl: string }> = {};
        for (const model of models) {
          counts[model.id] = model.accountCount || 0;
          const gcsUrl = model.avatarGcsUrl || model.avatarUrl || '';
          if (gcsUrl) {
            images[model.id] = {
              signedUrl: model.avatarUrl || gcsUrl,
              gcsUrl,
            };
          }
        }

        if (!cancelled) {
          setAllModels(models);
          setAccountCounts(counts);
          setModelPrimaryImages(images);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Build masterModels for VideoGenConfig (only selected models with primary images)
  const masterModels: MasterModel[] = selectedModelIds
    .map(id => {
      const model = allModels.find(m => m.id === id);
      const img = modelPrimaryImages[id];
      if (!model || !img) return null;
      return { modelId: id, modelName: model.name, primaryImageUrl: img.signedUrl, primaryGcsUrl: img.gcsUrl };
    })
    .filter((m): m is MasterModel => m !== null);

  // Auto-save draft
  useEffect(() => {
    const d: MasterDraft = { steps, name, videoSource, tiktokUrl, videoUrl, uploadedFilename, sourceDuration, previewUrl };
    try { sessionStorage.setItem(MASTER_DRAFT_KEY, JSON.stringify(d)); } catch {}
  }, [steps, name, videoSource, tiktokUrl, videoUrl, uploadedFilename, sourceDuration, previewUrl]);

  // Resolve pasted URL
  useEffect(() => {
    if (videoSource !== 'tiktok' || !tiktokUrl.trim()) {
      if (videoSource === 'tiktok') setPreviewUrl('');
      return;
    }

    const url = tiktokUrl.trim();
    const isTikTok = /tiktok\.com/i.test(url);
    const isInstagram = /instagram\.com\/(p|reel|reels)\//i.test(url);
    if (!isTikTok && !isInstagram) return;

    setIsResolvingPreview(true);
    setPreviewUrl('');

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/resolve-video-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data) => { if (data.videoUrl) setPreviewUrl(data.videoUrl); })
        .catch(() => {})
        .finally(() => setIsResolvingPreview(false));
    }, 800);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setIsResolvingPreview(false);
    };
  }, [tiktokUrl, videoSource]);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Panel resize + responsive
  const [panelWidth, setPanelWidth] = useState(380);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelExpanded, setPanelExpanded] = useState(false);
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
    const objectUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      if (vid.duration && isFinite(vid.duration)) setSourceDuration(Math.round(vid.duration));
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
    if (!presetName.trim()) { showToast('Enter a preset name', 'error'); return; }
    if (steps.length === 0) { showToast('Add pipeline steps first', 'error'); return; }
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

    if (selectedModelIds.length === 0) {
      showToast('Select at least one model', 'error');
      return;
    }

    // Check if first step needs input video
    const firstStep = enabledSteps[0];
    const needsInputVideo = !(
      (firstStep.type === 'video-generation' && (firstStep.config as { mode?: string }).mode === 'subtle-animation') ||
      (firstStep.type === 'batch-video-generation' && (firstStep.config as { mode?: string }).mode === 'subtle-animation') ||
      firstStep.type === 'compose'
    );

    if (needsInputVideo) {
      if (videoSource === 'tiktok' && !tiktokUrl) {
        showToast('Enter a video URL', 'error');
        setSelectedNodeId('source');
        return;
      }
      if (videoSource === 'upload' && !videoUrl) {
        showToast('Upload a video first', 'error');
        setSelectedNodeId('source');
        return;
      }
    }

    // Validate non-image steps (image validation is skipped — models provide them)
    const errors = new Map<string, string>();
    for (const s of enabledSteps) {
      switch (s.type) {
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
      const res = await fetch('/api/templates/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Master ${new Date().toLocaleTimeString()}`,
          pipeline: steps,
          videoSource,
          tiktokUrl: videoSource === 'tiktok' ? tiktokUrl : undefined,
          videoUrl: videoSource === 'upload' ? videoUrl : undefined,
          modelIds: selectedModelIds,
          caption: masterCaption,
          scheduledFor: publishMode === 'schedule' ? scheduledFor : undefined,
          timezone: publishMode === 'schedule' ? masterTimezone : undefined,
          publishMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create master batch');
      }

      try { sessionStorage.removeItem(MASTER_DRAFT_KEY); } catch {}
      showToast(`Master batch started with ${selectedModelIds.length} models!`, 'success');
      router.push('/jobs?tab=master');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start master batch', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="-m-8">
      <MasterPipelineHeader
        enabledStepCount={steps.filter((step) => step.enabled).length}
        selectedModelCount={selectedModelIds.length}
        isSubmitting={isSubmitting}
        panelOpen={panelOpen}
        onOpenPresets={() => setShowPresets(true)}
        onOpenSavePreset={() => setShowSavePreset(true)}
        onTogglePanel={() => setPanelOpen((prev) => !prev)}
        onRun={handleRun}
      />

      {/* Main area: Canvas + Panel */}
      <div className="flex" style={{ height: 'calc(100vh - 7.5rem)' }}>
        {/* Left: Flow canvas */}
        {!panelExpanded && (
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
        )}

        {/* Right panel: MasterCanvasPanel (default) or NodeConfigPanel (when step selected) */}
        {panelOpen && (
          <>
            {isMobile && !panelExpanded && (
              <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setPanelOpen(false)} />
            )}

            <div
              className={`relative shrink-0 transition-all duration-200 ${
                panelExpanded
                  ? 'flex-1 my-3 mx-3 overflow-hidden overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-lg'
                  : isMobile
                    ? 'fixed right-0 top-0 z-40 h-full w-[85vw] max-w-[420px] shadow-2xl'
                    : 'my-3 mr-3 overflow-hidden overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-lg'
              }`}
              style={panelExpanded || isMobile ? undefined : { width: panelWidth }}
            >
              {!isMobile && !panelExpanded && (
                <div
                  onMouseDown={onDragStart}
                  className="absolute left-0 top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
                  style={{ marginLeft: -8 }}
                >
                  <div className="h-8 w-1 rounded-full bg-[var(--text-muted)]/30 transition-colors hover:bg-[var(--text-muted)]/60" />
                </div>
              )}

              <input ref={fileRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />

              {selectedNodeId ? (
                <NodeConfigPanel
                  selectedId={selectedNodeId}
                  steps={steps}
                  onUpdateStep={(id, updated) => { handleUpdateStep(id, updated); setValidationErrors((prev) => { const next = new Map(prev); next.delete(id); return next; }); }}
                  onRemoveStep={handleRemoveStep}
                  onClose={() => { setSelectedNodeId(null); setPanelExpanded(false); if (isMobile) setPanelOpen(false); }}
                  validationError={selectedNodeId !== 'source' ? validationErrors.get(selectedNodeId) : undefined}
                  masterMode
                  masterModels={masterModels}
                  isExpanded={panelExpanded}
                  onToggleExpand={() => setPanelExpanded((p) => !p)}
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
                  isLoadingVideo={isResolvingPreview}
                />
              ) : (
                <MasterCanvasPanel
                  models={allModels}
                  selectedModelIds={selectedModelIds}
                  onSelectedModelIdsChange={setSelectedModelIds}
                  caption={masterCaption}
                  onCaptionChange={setMasterCaption}
                  publishMode={publishMode}
                  onPublishModeChange={setPublishMode}
                  scheduledFor={scheduledFor}
                  onScheduledForChange={setScheduledFor}
                  timezone={masterTimezone}
                  onTimezoneChange={setMasterTimezone}
                  accountCounts={accountCounts}
                />
              )}
            </div>
          </>
        )}
      </div>

      <MasterPipelinePresetModals
        showPresets={showPresets}
        showSavePreset={showSavePreset}
        presets={presets}
        presetsLoading={presetsLoading}
        presetSaving={presetSaving}
        presetName={presetName}
        stepsCount={steps.length}
        onClosePresets={() => setShowPresets(false)}
        onCloseSavePreset={() => setShowSavePreset(false)}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={deletePreset}
        onPresetNameChange={setPresetName}
        onSavePreset={handleSavePreset}
      />
    </div>
  );
}
