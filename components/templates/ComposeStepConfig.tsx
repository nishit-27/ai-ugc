'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import ComposeCanvas from '@/components/compose/ComposeCanvas';
import ComposeToolbar from '@/components/compose/ComposeToolbar';
import ComposeAssetPanel from '@/components/compose/ComposeAssetPanel';
import ComposeLayerPanel from '@/components/compose/ComposeLayerPanel';
import ComposeLayerConfig from '@/components/compose/ComposeLayerConfig';
import ComposePresetPicker from '@/components/compose/ComposePresetPicker';
import ComposeTimeline from '@/components/compose/ComposeTimeline';
import ResizeHandle from '@/components/compose/ResizeHandle';
import { useComposeCanvas } from '@/hooks/useComposeCanvas';
import { useTimelinePlayhead } from '@/hooks/useTimelinePlayhead';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import type { ComposeConfig, MiniAppStep, LayerSource, VideoGenConfig as VGC, BatchVideoGenConfig as BVGC, BatchImageEntry, TextOverlayConfig, BgMusicConfig, AttachVideoConfig } from '@/types';
import type { MasterModel } from './NodeConfigPanel';

type ComposeStepConfigProps = {
  config: ComposeConfig;
  onChange: (config: ComposeConfig) => void;
  steps: MiniAppStep[];
  currentStepId: string;
  isExpanded?: boolean;
  masterModels?: MasterModel[];
  libraryVideos?: Record<string, string>;
};

export default function ComposeStepConfig({
  config: externalConfig,
  onChange,
  steps,
  currentStepId,
  isExpanded,
  masterModels,
  libraryVideos,
}: ComposeStepConfigProps) {
  const [showPresets, setShowPresets] = useState(false);
  const [zoom, setZoom] = useState(1);

  const compose = useComposeCanvas(externalConfig);

  // Resizable panels
  const leftPanel = useResizablePanel({ initialSize: 220, minSize: 160, maxSize: 360, direction: 'horizontal' });
  const rightPanel = useResizablePanel({ initialSize: 220, minSize: 160, maxSize: 360, direction: 'horizontal' });
  const timelinePanel = useResizablePanel({ initialSize: 220, minSize: 120, maxSize: 450, direction: 'vertical' });

  // Timeline playhead
  const playhead = useTimelinePlayhead({
    isPlaying: compose.isPlaying,
    getVideoElements: compose.getVideoElements,
    seekGlobal: compose.seekGlobal,
  });

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

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    onChangeRef.current(compose.config);
  }, [compose.config]);

  const handleAddLayer = async (source: LayerSource, type: 'video' | 'image') => {
    await compose.addLayer(source, type);
  };

  const handleTimelineTrimUpdate = useCallback(
    (layerId: string, trimStart: number, trimEnd: number) => {
      compose.updateLayer(layerId, { trim: { startSec: trimStart, endSec: trimEnd } });
    },
    [compose.updateLayer],
  );

  const pipelineSteps = useMemo(() => {
    const currentIdx = steps.findIndex((s) => s.id === currentStepId);
    const prevSteps = steps.slice(0, currentIdx).filter((s) => s.enabled);

    type PipelineStepEntry = {
      stepId: string;
      type: string;
      label: string;
      previewUrl?: string;
      modelRefs?: { modelId: string; modelName: string; imageUrl: string; firstFrameUrl?: string; videoUrl?: string }[];
      batchImages?: { imageUrl: string; filename?: string; imageId?: string }[];
    };

    const result: PipelineStepEntry[] = [];

    // Include library video source as a virtual pipeline entry
    if (libraryVideos && Object.keys(libraryVideos).length > 0 && masterModels && masterModels.length > 0) {
      result.push({
        stepId: '__video-source',
        type: 'video-source',
        label: 'Library Video Source',
        previewUrl: masterModels[0]?.primaryImageUrl,
        modelRefs: masterModels
          .filter((m) => libraryVideos[m.modelId])
          .map((m) => ({
            modelId: m.modelId,
            modelName: m.modelName,
            imageUrl: m.primaryImageUrl,
            firstFrameUrl: undefined,
            videoUrl: libraryVideos![m.modelId],
          })),
      });
    }

    for (const s of prevSteps) {
      if (s.type === 'video-generation' || s.type === 'batch-video-generation') {
        const cfg = s.config as VGC | BVGC;

        if (s.type === 'batch-video-generation') {
          const batchCfg = cfg as BVGC;
          const batchImages = (batchCfg.images || []).map((img: BatchImageEntry) => ({
            imageUrl: img.imageUrl || '',
            filename: img.filename,
            imageId: img.imageId,
          }));

          if (masterModels && masterModels.length > 0) {
            const batchVgCfg = cfg as BVGC;
            result.push({
              stepId: s.id,
              type: s.type,
              label: 'Batch Video Gen Output',
              previewUrl: batchImages[0]?.imageUrl || masterModels[0]?.primaryImageUrl,
              modelRefs: masterModels.map((m) => ({
                modelId: m.modelId,
                modelName: m.modelName,
                imageUrl: m.primaryImageUrl,
                firstFrameUrl: (batchVgCfg as unknown as VGC).masterFirstFrames?.[m.modelId],
              })),
              batchImages,
            });
          } else {
            result.push({
              stepId: s.id,
              type: s.type,
              label: `Batch Video Gen (${batchImages.length} video${batchImages.length !== 1 ? 's' : ''})`,
              previewUrl: batchImages[0]?.imageUrl,
              batchImages,
            });
          }
        } else {
          const vgCfg = cfg as VGC;
          const previewUrl = vgCfg.imageUrl || undefined;

          if (masterModels && masterModels.length > 0) {
            result.push({
              stepId: s.id,
              type: s.type,
              label: 'Video Gen Output',
              previewUrl: previewUrl || masterModels[0]?.primaryImageUrl,
              modelRefs: masterModels.map((m) => ({
                modelId: m.modelId,
                modelName: m.modelName,
                imageUrl: m.primaryImageUrl,
                firstFrameUrl: vgCfg.masterFirstFrames?.[m.modelId],
              })),
            });
          } else {
            result.push({ stepId: s.id, type: s.type, label: 'Video Gen Output', previewUrl });
          }
        }
      } else if (s.type === 'text-overlay') {
        const textCfg = s.config as TextOverlayConfig;
        const preview = textCfg.text ? textCfg.text.slice(0, 30) + (textCfg.text.length > 30 ? '...' : '') : 'Text';
        result.push({
          stepId: s.id,
          type: s.type,
          label: `Text Overlay: ${preview}`,
        });
      } else if (s.type === 'bg-music') {
        result.push({
          stepId: s.id,
          type: s.type,
          label: 'BG Music',
        });
      } else if (s.type === 'attach-video') {
        const attachCfg = s.config as AttachVideoConfig;
        const pos = attachCfg.position === 'before' ? 'Prepend' : 'Append';
        result.push({
          stepId: s.id,
          type: s.type,
          label: `Attach Video (${pos})`,
          previewUrl: attachCfg.videoUrl || undefined,
        });
      }
    }

    return result;
  }, [steps, currentStepId, masterModels, libraryVideos]);

  const selectedLayer = compose.config.layers.find((l) => l.id === compose.selectedLayerId);

  if (!isExpanded) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-[var(--text-muted)]" />
            <div className="flex-1">
              <div className="text-xs font-medium text-[var(--text)]">
                {compose.config.layers.length} layer{compose.config.layers.length !== 1 ? 's' : ''}
                {compose.config.preset && ` \u00b7 ${compose.config.preset.replace(/-/g, ' ')}`}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {compose.config.aspectRatio} \u00b7 {compose.config.canvasWidth}x{compose.config.canvasHeight}
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          Expand the panel to edit the compose canvas.
        </p>
      </div>
    );
  }

  return (
    <div ref={editorRef} className="flex h-full flex-col bg-[var(--background)]">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/80 px-3 py-2 backdrop-blur-sm">
        <ComposeToolbar
          aspectRatio={compose.config.aspectRatio}
          onAspectRatioChange={compose.setAspectRatio}
          onPresetPick={() => setShowPresets(true)}
          backgroundColor={compose.config.backgroundColor}
          onBackgroundColorChange={compose.setBackgroundColor}
          isPlaying={compose.isPlaying}
          onPlayPause={() => compose.isPlaying ? compose.pauseAll() : compose.playAll()}
          zoom={zoom}
          onZoomChange={setZoom}
          onZoomFit={() => setZoom(1)}
          onFullscreen={handleFullscreen}
        />
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
              mode="pipeline"
              onAddLayer={handleAddLayer}
              pipelineSteps={pipelineSteps}
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

        {/* Timeline panel (resizable height) */}
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
