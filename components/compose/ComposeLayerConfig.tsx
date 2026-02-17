'use client';

import type { ComposeLayer, ComposeLayerFit } from '@/types';

type ComposeLayerConfigProps = {
  layer: ComposeLayer;
  onUpdate: (updates: Partial<ComposeLayer>) => void;
};

export default function ComposeLayerConfig({ layer, onUpdate }: ComposeLayerConfigProps) {
  const fitOptions: ComposeLayerFit[] = ['cover', 'contain', 'stretch'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Properties
        </span>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">Position</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">X (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(layer.x * 100)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) / 100 })}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">Y (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(layer.y * 100)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) / 100 })}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">Size</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">Width (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={Math.round(layer.width * 100)}
              onChange={(e) => onUpdate({ width: Number(e.target.value) / 100 })}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">Height (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={Math.round(layer.height * 100)}
              onChange={(e) => onUpdate({ height: Number(e.target.value) / 100 })}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">Fit Mode</label>
        <div className="flex gap-1">
          {fitOptions.map((fit) => (
            <button
              key={fit}
              onClick={() => onUpdate({ fit })}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium capitalize transition-colors ${
                layer.fit === fit
                  ? 'bg-[var(--primary)] text-white'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
              }`}
            >
              {fit}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
          <span>Border Radius</span>
          <span className="text-[10px]">{layer.borderRadius ?? 0}px</span>
        </label>
        <input
          type="range"
          min={0}
          max={50}
          value={layer.borderRadius ?? 0}
          onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
          <span>Opacity</span>
          <span className="text-[10px]">{Math.round((layer.opacity ?? 1) * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((layer.opacity ?? 1) * 100)}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </div>

      {layer.type === 'video' && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">Trim (seconds)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">Start</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={layer.trim?.startSec ?? 0}
                onChange={(e) => onUpdate({ trim: { startSec: Number(e.target.value), endSec: layer.trim?.endSec ?? 0 } })}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">End</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={layer.trim?.endSec ?? 0}
                onChange={(e) => onUpdate({ trim: { startSec: layer.trim?.startSec ?? 0, endSec: Number(e.target.value) } })}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text)]"
                placeholder="0 = full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
