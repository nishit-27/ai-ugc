'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { Save, Play, RotateCcw, ChevronLeft, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from 'lucide-react';
import gsap from 'gsap';
import { useTwitterPipeline } from '@/hooks/useTwitterPipeline';
import { TwitterPipelineCanvas, TwitterStepPicker, TwitterStepConfigPanel, TwitterCanvasPanel } from '@/components/twitter';
import type { TwitterStepType } from '@/types';

function TwitterPipelineContent() {
  const {
    steps,
    pipelineName,
    setPipelineName,
    selectedStep,
    selectedStepId,
    setSelectedStepId,
    isExecuting,
    isGenerating,
    pipelineStatus,
    savedPipelines,
    addStep,
    removeStep,
    updateStepConfig,
    toggleStep,
    savePipeline,
    executePipeline,
    loadPipeline,
    clearPipeline,
    fetchTweetContext,
    generateTweet,
    allModels,
    isLoadingModels,
    twitterAccountCounts,
    selectedModelIds,
    setSelectedModelIds,
    publishMode,
    setPublishMode,
    scheduledFor,
    setScheduledFor,
    timezone,
    setTimezone,
  } = useTwitterPipeline();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);

  const headerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  // Page entrance animation
  useEffect(() => {
    if (!headerRef.current || !mainRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(headerRef.current, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
    tl.fromTo(mainRef.current, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, '-=0.15');
  }, []);

  // Panel resize drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = dragStartX.current - ev.clientX;
      setPanelWidth(Math.max(280, Math.min(600, dragStartW.current + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const handleSelectStep = (type: TwitterStepType) => {
    addStep(type);
  };

  const enabledStepCount = steps.filter((s) => s.enabled).length;
  const canExecute = enabledStepCount > 0 && selectedModelIds.length > 0 && pipelineStatus !== 'running';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        ref={headerRef}
        className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-primary)]"
      >
        <div className="flex items-center justify-between px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
              <svg className="h-3.5 w-3.5 text-[var(--text-primary)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <div>
              <input
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder="Pipeline name..."
              />
              <div className="text-[11px] text-[var(--text-muted)]">
                {enabledStepCount} step{enabledStepCount !== 1 ? 's' : ''} &middot; {selectedModelIds.length} model{selectedModelIds.length !== 1 ? 's' : ''}
                {pipelineStatus !== 'draft' && (
                  <span className={`ml-2 ${
                    pipelineStatus === 'running' ? 'text-blue-500' : pipelineStatus === 'completed' ? 'text-emerald-500' : pipelineStatus === 'failed' ? 'text-red-500' : ''
                  }`}>
                    {pipelineStatus}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center">
            {/* Saved pipelines */}
            <div className="relative">
              <button
                onClick={() => setShowSavedList(!showSavedList)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] rounded-lg"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Presets
              </button>
              {showSavedList && savedPipelines.length > 0 && (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
                  {savedPipelines.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { loadPipeline(p); setShowSavedList(false); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <span className="truncate text-[var(--text-primary)]">{p.name}</span>
                      <span className="ml-2 text-[10px] text-[var(--text-muted)]">{p.steps?.length || 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1.5 h-4 w-px bg-[var(--border)]" />

            {/* Save */}
            <button
              onClick={savePipeline}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Panel toggle */}
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              {panelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Panel</span>
            </button>

            <div className="mx-1.5 h-4 w-px bg-[var(--border)]" />

            {/* Clear */}
            <button
              onClick={clearPipeline}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              title="Clear pipeline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Execute */}
            <button
              onClick={executePipeline}
              disabled={!canExecute || isExecuting}
              className="ml-2 flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
            >
              {isExecuting ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Run ({selectedModelIds.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div ref={mainRef} className="flex flex-1 overflow-hidden">
        {/* Pipeline Canvas */}
        <TwitterPipelineCanvas
          steps={steps}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
          onToggleStep={toggleStep}
          onRemoveStep={removeStep}
          onAddStep={() => setIsPickerOpen(true)}
        />

        {/* Right panel */}
        {panelOpen && (
          <div
            className={`relative hidden lg:flex ${
              panelExpanded ? 'flex-1 m-3 rounded-2xl border border-[var(--border)] shadow-lg' : ''
            }`}
            style={panelExpanded ? undefined : { width: panelWidth, flexShrink: 0 }}
          >
            {/* Drag handle (only when not expanded) */}
            {!panelExpanded && (
              <div
                onMouseDown={onDragStart}
                className="absolute left-0 top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
                style={{ marginLeft: -8 }}
              >
                <div className="h-8 w-1 rounded-full bg-[var(--text-muted)]/30 transition-colors hover:bg-[var(--text-muted)]/60" />
              </div>
            )}

            <div className="flex h-full w-full flex-col overflow-hidden">
              {/* Panel header with expand/minimize */}
              {selectedStep && (
                <div className="flex items-center justify-end border-b border-[var(--border)] px-2 py-1">
                  <button
                    onClick={() => setPanelExpanded(!panelExpanded)}
                    className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    title={panelExpanded ? 'Minimize panel' : 'Expand panel'}
                  >
                    {panelExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              {/* Panel content */}
              {selectedStep ? (
                <TwitterStepConfigPanel
                  step={selectedStep}
                  onClose={() => setSelectedStepId(null)}
                  onUpdate={updateStepConfig}
                  onGenerate={generateTweet}
                  onFetchTweet={fetchTweetContext}
                  isGenerating={isGenerating}
                />
              ) : (
                <TwitterCanvasPanel
                  models={allModels}
                  isLoadingModels={isLoadingModels}
                  selectedModelIds={selectedModelIds}
                  onSelectedModelIdsChange={setSelectedModelIds}
                  twitterAccountCounts={twitterAccountCounts}
                  publishMode={publishMode}
                  onPublishModeChange={setPublishMode}
                  scheduledFor={scheduledFor}
                  onScheduledForChange={setScheduledFor}
                  timezone={timezone}
                  onTimezoneChange={setTimezone}
                />
              )}
            </div>
          </div>
        )}

        {/* Mobile: step config as full screen overlay */}
        {selectedStep && (
          <div className="fixed inset-0 z-40 bg-[var(--bg-primary)] lg:hidden">
            <TwitterStepConfigPanel
              step={selectedStep}
              onClose={() => setSelectedStepId(null)}
              onUpdate={updateStepConfig}
              onGenerate={generateTweet}
              onFetchTweet={fetchTweetContext}
              isGenerating={isGenerating}
            />
          </div>
        )}
      </div>

      {/* Step Picker Modal */}
      <TwitterStepPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSelectStep}
      />
    </div>
  );
}

export default function TwitterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text-muted)]" />
        </div>
      }
    >
      <TwitterPipelineContent />
    </Suspense>
  );
}
