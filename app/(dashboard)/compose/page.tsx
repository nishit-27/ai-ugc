'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ComposeCanvas from '@/components/compose/ComposeCanvas';
import ComposeToolbar from '@/components/compose/ComposeToolbar';
import ComposeAssetPanel from '@/components/compose/ComposeAssetPanel';
import ComposeLayerPanel from '@/components/compose/ComposeLayerPanel';
import ComposeLayerConfig from '@/components/compose/ComposeLayerConfig';
import ComposePresetPicker from '@/components/compose/ComposePresetPicker';
import { useComposeCanvas } from '@/hooks/useComposeCanvas';
import { useToast } from '@/hooks/useToast';
import type { ComposePresetId, LayerSource } from '@/types';

export default function ComposePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [showPresets, setShowPresets] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const compose = useComposeCanvas();

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
      router.push('/jobs');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to render', 'error');
    } finally {
      setIsRendering(false);
    }
  }, [compose.config, showToast, router]);

  return (
    <div className="-m-8 flex h-[calc(100vh-0rem)] flex-col">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Compose</h1>
          <p className="text-xs text-[var(--text-muted)]">Arrange multiple media into a single frame</p>
        </div>
      </div>

      <div className="px-4 pb-3 md:px-6">
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
        />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-60 shrink-0 overflow-hidden">
          <ComposeAssetPanel
            mode="standalone"
            onAddLayer={compose.addLayer}
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

        <div className="w-60 shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-3 space-y-4">
          <ComposeLayerPanel
            layers={compose.config.layers}
            selectedLayerId={compose.selectedLayerId}
            onSelect={compose.setSelectedLayerId}
            onRemove={compose.removeLayer}
            onReorder={compose.reorderLayers}
          />
          {selectedLayer && (
            <>
              <div className="h-px bg-[var(--border)]" />
              <ComposeLayerConfig
                layer={selectedLayer}
                onUpdate={(updates) => compose.updateLayer(selectedLayer.id, updates)}
              />
            </>
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
