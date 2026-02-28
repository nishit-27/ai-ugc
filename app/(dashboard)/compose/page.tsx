'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ComposeCanvas from '@/components/compose/ComposeCanvas';
import ComposeToolbar from '@/components/compose/ComposeToolbar';
import ComposeAssetPanel from '@/components/compose/ComposeAssetPanel';
import ComposeLayerPanel from '@/components/compose/ComposeLayerPanel';
import ComposeLayerConfig from '@/components/compose/ComposeLayerConfig';
import ComposePresetPicker from '@/components/compose/ComposePresetPicker';
import ComposeTimeline from '@/components/compose/ComposeTimeline';
import ResizeHandle from '@/components/compose/ResizeHandle';
import { useComposeCanvas } from '@/hooks/useComposeCanvas';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useTimelinePlayhead } from '@/hooks/useTimelinePlayhead';
import { useToast } from '@/hooks/useToast';
import type { ComposePresetId, LayerSource } from '@/types';

export default function ComposePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [showPresets, setShowPresets] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [zoom, setZoom] = useState(1);

  const compose = useComposeCanvas();

  // Resizable panels
  const leftPanel = useResizablePanel({ initialSize: 240, minSize: 180, maxSize: 400, direction: 'horizontal' });
  const rightPanel = useResizablePanel({ initialSize: 256, minSize: 200, maxSize: 400, direction: 'horizontal' });
  const timelinePanel = useResizablePanel({ initialSize: 240, minSize: 140, maxSize: 500, direction: 'vertical' });

  // Timeline playhead
  const playhead = useTimelinePlayhead({
    isPlaying: compose.isPlaying,
    getVideoElements: compose.getVideoElements,
    seekGlobal: compose.seekGlobal,
  });

  const selectedLayer = compose.config.layers.find((l) => l.id === compose.selectedLayerId);

  const handleRender = useCallback(async () => {
    if (compose.config.layers.length === 0) {
      showToast('Add at least one layer before rendering', 'error');
      return;
    }

    setIsRendering(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Compose ${new Date().toLocaleTimeString()}`,
          pipeline: [{
            id: `step-${Date.now()}-compose`,
            type: 'compose',
            config: compose.config,
            enabled: true,
          }],
          videoSource: 'upload',
          videoUrl: undefined,
          tiktokUrl: undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start compose job');
      }

      const data = await res.json();
      try {
        sessionStorage.setItem('ai-ugc-new-job', JSON.stringify(data));
      } catch {}
      showToast('Compose job started!', 'success');
      router.push('/batches');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to render', 'error');
    } finally {
      setIsRendering(false);
    }
  }, [compose.config, showToast, router]);

  // Handle timeline trim updates
  const handleTimelineTrimUpdate = useCallback(
    (layerId: string, trimStart: number, trimEnd: number) => {
      compose.updateLayer(layerId, { trim: { startSec: trimStart, endSec: trimEnd } });
    },
    [compose.updateLayer],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ': {
          e.preventDefault();
          if (compose.isPlaying) {
            compose.pauseAll();
          } else {
            compose.playAll();
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (compose.selectedLayerId) {
            e.preventDefault();
            compose.removeLayer(compose.selectedLayerId);
          }
          break;
        }
        case 'Escape': {
          compose.deselectAll();
          break;
        }
        case 'ArrowLeft': {
          if (compose.selectedLayerId) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            compose.nudgeLayer(compose.selectedLayerId, -step, 0);
          }
          break;
        }
        case 'ArrowRight': {
          if (compose.selectedLayerId) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            compose.nudgeLayer(compose.selectedLayerId, step, 0);
          }
          break;
        }
        case 'ArrowUp': {
          if (compose.selectedLayerId) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            compose.nudgeLayer(compose.selectedLayerId, 0, -step);
          }
          break;
        }
        case 'ArrowDown': {
          if (compose.selectedLayerId) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            compose.nudgeLayer(compose.selectedLayerId, 0, step);
          }
          break;
        }
        case '[': {
          // Set trim IN point at current playhead for selected layer
          if (compose.selectedLayerId) {
            e.preventDefault();
            const layer = compose.config.layers.find((l) => l.id === compose.selectedLayerId);
            if (layer && layer.type === 'video') {
              const dur = compose.videoDurations.get(layer.id) ?? 60;
              const currentEnd = layer.trim?.endSec ?? dur;
              const newStart = Math.max(0, Math.min(playhead.currentTime, currentEnd - 0.1));
              compose.updateLayer(layer.id, { trim: { startSec: newStart, endSec: currentEnd } });
            }
          }
          break;
        }
        case ']': {
          // Set trim OUT point at current playhead for selected layer
          if (compose.selectedLayerId) {
            e.preventDefault();
            const layer = compose.config.layers.find((l) => l.id === compose.selectedLayerId);
            if (layer && layer.type === 'video') {
              const dur = compose.videoDurations.get(layer.id) ?? 60;
              const currentStart = layer.trim?.startSec ?? 0;
              const newEnd = Math.max(currentStart + 0.1, Math.min(playhead.currentTime, dur));
              compose.updateLayer(layer.id, { trim: { startSec: currentStart, endSec: newEnd } });
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [compose.isPlaying, compose.selectedLayerId, compose.config.layers, compose.playAll, compose.pauseAll, compose.removeLayer, compose.nudgeLayer, compose.deselectAll, compose.updateLayer, compose.videoDurations, playhead.currentTime]);

  const handleZoomFit = useCallback(() => {
    setZoom(1);
  }, []);

  const editorRef = useRef<HTMLDivElement>(null);
  const handleFullscreen = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div ref={editorRef} className="-m-8 flex h-[calc(100vh-0rem)] flex-col bg-[var(--background)]">
      {/* Sticky toolbar header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-2 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-tight text-[var(--primary)]">Compose</h1>
          <div className="flex-1">
            <ComposeToolbar
              aspectRatio={compose.config.aspectRatio}
              onAspectRatioChange={compose.setAspectRatio}
              onPresetPick={() => setShowPresets(true)}
              backgroundColor={compose.config.backgroundColor}
              onBackgroundColorChange={compose.setBackgroundColor}
              isPlaying={compose.isPlaying}
              onPlayPause={() => compose.isPlaying ? compose.pauseAll() : compose.playAll()}
              onRender={handleRender}
              isRendering={isRendering}
              zoom={zoom}
              onZoomChange={setZoom}
              onZoomFit={handleZoomFit}
              onFullscreen={handleFullscreen}
            />
          </div>
        </div>
      </div>

      {/* Main editor area + timeline */}
      <div className="flex flex-1 flex-col min-h-0">
        {/* Editor area: left sidebar | canvas | right sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel — assets (resizable) */}
          <div
            className="shrink-0 overflow-hidden border-r border-[var(--border)]"
            style={{ width: leftPanel.size }}
          >
            <ComposeAssetPanel
              mode="standalone"
              onAddLayer={compose.addLayer}
            />
          </div>

          {/* Left resize handle */}
          <ResizeHandle
            direction="horizontal"
            onPointerDown={(e) => leftPanel.onPointerDown(e)}
          />

          {/* Center — canvas */}
          <div className="flex-1 min-w-0">
            <ComposeCanvas
              onInit={compose.initCanvas}
              onResize={compose.resizeCanvas}
              aspectRatio={compose.config.canvasWidth / compose.config.canvasHeight}
              preset={compose.config.preset}
              layers={compose.config.layers}
              zoom={zoom}
              onSlotClick={(slotIdx) => compose.setPendingSlotIndex(slotIdx)}
              pendingSlotIndex={compose.pendingSlotIndex}
            />
          </div>

          {/* Right resize handle */}
          <ResizeHandle
            direction="horizontal"
            onPointerDown={(e) => rightPanel.onPointerDown(e, true)}
          />

          {/* Right panel — layers + properties (resizable) */}
          <div
            className="shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-3 space-y-4"
            style={{ width: rightPanel.size }}
          >
            <ComposeLayerPanel
              layers={compose.config.layers}
              selectedLayerId={compose.selectedLayerId}
              hiddenLayerIds={compose.hiddenLayerIds}
              onSelect={compose.setSelectedLayerId}
              onRemove={compose.removeLayer}
              onReorder={compose.reorderLayers}
              onToggleVisibility={compose.toggleLayerVisibility}
            />
            {selectedLayer && (
              <>
                <div className="h-px bg-[var(--border)]" />
                <ComposeLayerConfig
                  layer={selectedLayer}
                  onUpdate={(updates) => compose.updateLayer(selectedLayer.id, updates)}
                  videoDuration={compose.videoDurations.get(selectedLayer.id)}
                  onSeek={(timeSec) => compose.seekTo(selectedLayer.id, timeSec)}
                />
              </>
            )}
          </div>
        </div>

        {/* Horizontal resize handle for timeline */}
        <ResizeHandle
          direction="vertical"
          onPointerDown={(e) => timelinePanel.onPointerDown(e, true)}
        />

        {/* Timeline panel */}
        <div
          className="shrink-0"
          style={{ height: timelinePanel.size }}
        >
          <ComposeTimeline
            layers={compose.config.layers}
            videoDurations={compose.videoDurations}
            selectedLayerId={compose.selectedLayerId}
            hiddenLayerIds={compose.hiddenLayerIds}
            currentTime={playhead.currentTime}
            isPlaying={compose.isPlaying}
            onSeek={playhead.seek}
            onSelectLayer={compose.setSelectedLayerId}
            onUpdateTrim={handleTimelineTrimUpdate}
            onRemoveLayer={compose.removeLayer}
            onDuplicateLayer={compose.duplicateLayer}
            onToggleVisibility={compose.toggleLayerVisibility}
            onToggleAudio={compose.toggleAudioDetach}
            onPlayPause={() => compose.isPlaying ? compose.pauseAll() : compose.playAll()}
          />
        </div>
      </div>

      <ComposePresetPicker
        open={showPresets}
        onClose={() => setShowPresets(false)}
        onSelect={compose.applyPreset}
        currentPreset={compose.config.preset}
      />
    </div>
  );
}
