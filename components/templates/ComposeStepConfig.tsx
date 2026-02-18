'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import ComposeCanvas from '@/components/compose/ComposeCanvas';
import ComposeToolbar from '@/components/compose/ComposeToolbar';
import ComposeAssetPanel from '@/components/compose/ComposeAssetPanel';
import ComposeLayerPanel from '@/components/compose/ComposeLayerPanel';
import ComposeLayerConfig from '@/components/compose/ComposeLayerConfig';
import ComposePresetPicker from '@/components/compose/ComposePresetPicker';
import { useComposeCanvas } from '@/hooks/useComposeCanvas';
import type { ComposeConfig, MiniAppStep, LayerSource, VideoGenConfig as VGC, BatchVideoGenConfig as BVGC, BatchImageEntry } from '@/types';
import type { MasterModel } from './NodeConfigPanel';

type ComposeStepConfigProps = {
  config: ComposeConfig;
  onChange: (config: ComposeConfig) => void;
  steps: MiniAppStep[];
  currentStepId: string;
  isExpanded?: boolean;
  masterModels?: MasterModel[];
};

export default function ComposeStepConfig({
  config: externalConfig,
  onChange,
  steps,
  currentStepId,
  isExpanded,
  masterModels,
}: ComposeStepConfigProps) {
  const [showPresets, setShowPresets] = useState(false);

  const compose = useComposeCanvas(externalConfig);

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

  const pipelineSteps = useMemo(() => {
    const currentIdx = steps.findIndex((s) => s.id === currentStepId);
    const prevSteps = steps.slice(0, currentIdx).filter((s) => s.enabled);
    const videoGenSteps = prevSteps.filter((s) => s.type === 'video-generation' || s.type === 'batch-video-generation');

    type PipelineStepEntry = {
      stepId: string;
      type: string;
      label: string;
      previewUrl?: string;
      modelRefs?: { modelId: string; modelName: string; imageUrl: string }[];
      batchImages?: { imageUrl: string; filename?: string; imageId?: string }[];
    };

    const result: PipelineStepEntry[] = [];

    for (const s of videoGenSteps) {
      const cfg = s.config as VGC | BVGC;

      if (s.type === 'batch-video-generation') {
        const batchCfg = cfg as BVGC;
        const batchImages = (batchCfg.images || []).map((img: BatchImageEntry) => ({
          imageUrl: img.imageUrl || '',
          filename: img.filename,
          imageId: img.imageId,
        }));

        if (masterModels && masterModels.length > 0) {
          result.push({
            stepId: s.id,
            type: s.type,
            label: 'Batch Video Gen Output',
            previewUrl: batchImages[0]?.imageUrl || masterModels[0]?.primaryImageUrl,
            modelRefs: masterModels.map((m) => ({
              modelId: m.modelId,
              modelName: m.modelName,
              imageUrl: m.primaryImageUrl,
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
            })),
          });
        } else {
          result.push({ stepId: s.id, type: s.type, label: 'Video Gen Output', previewUrl });
        }
      }
    }

    return result;
  }, [steps, currentStepId, masterModels]);

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
    <div className="flex h-full flex-col gap-3">
      <ComposeToolbar
        aspectRatio={compose.config.aspectRatio}
        onAspectRatioChange={compose.setAspectRatio}
        onPresetPick={() => setShowPresets(true)}
        backgroundColor={compose.config.backgroundColor}
        onBackgroundColorChange={compose.setBackgroundColor}
        isPlaying={compose.isPlaying}
        onPlayPause={() => compose.isPlaying ? compose.pauseAll() : compose.playAll()}
      />

      <div className="flex flex-1 gap-3 min-h-0">
        <div className="w-56 shrink-0 overflow-y-auto rounded-lg border border-[var(--border)]">
          <ComposeAssetPanel
            mode="pipeline"
            onAddLayer={handleAddLayer}
            pipelineSteps={pipelineSteps}
          />
        </div>

        <div className="flex-1 min-w-0">
          <ComposeCanvas
            onInit={compose.initCanvas}
            onResize={compose.resizeCanvas}
            aspectRatio={compose.config.canvasWidth / compose.config.canvasHeight}
            preset={compose.config.preset}
            layers={compose.config.layers}

          />
        </div>

        <div className="w-56 shrink-0 space-y-3 overflow-y-auto">
          <ComposeLayerPanel
            layers={compose.config.layers}
            selectedLayerId={compose.selectedLayerId}
            onSelect={compose.setSelectedLayerId}
            onRemove={compose.removeLayer}
            onReorder={compose.reorderLayers}
          />
          {selectedLayer && (
            <ComposeLayerConfig
              layer={selectedLayer}
              onUpdate={(updates) => compose.updateLayer(selectedLayer.id, updates)}
            />
          )}
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
