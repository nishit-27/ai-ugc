'use client';

import { PRESETS } from './presets';
import type { ComposePresetId } from '@/types';
import Modal from '@/components/ui/Modal';

type ComposePresetPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (presetId: ComposePresetId) => void;
  currentPreset: ComposePresetId | null;
};

function PresetIcon({ preset }: { preset: ComposePresetId }) {
  const s = 48;
  switch (preset) {
    case '2up-vertical':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="40" height="18" rx="2" fill="var(--primary)" opacity={0.3} />
          <rect x="4" y="26" width="40" height="18" rx="2" fill="var(--primary)" opacity={0.6} />
        </svg>
      );
    case 'side-by-side':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="18" height="40" rx="2" fill="var(--primary)" opacity={0.3} />
          <rect x="26" y="4" width="18" height="40" rx="2" fill="var(--primary)" opacity={0.6} />
        </svg>
      );
    case 'pip':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="40" height="40" rx="2" fill="var(--primary)" opacity={0.2} />
          <rect x="28" y="28" width="14" height="14" rx="2" fill="var(--primary)" opacity={0.7} />
        </svg>
      );
    case 'grid-2x2':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="18" height="18" rx="2" fill="var(--primary)" opacity={0.3} />
          <rect x="26" y="4" width="18" height="18" rx="2" fill="var(--primary)" opacity={0.4} />
          <rect x="4" y="26" width="18" height="18" rx="2" fill="var(--primary)" opacity={0.5} />
          <rect x="26" y="26" width="18" height="18" rx="2" fill="var(--primary)" opacity={0.6} />
        </svg>
      );
    case '3-panel':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="24" height="40" rx="2" fill="var(--primary)" opacity={0.3} />
          <rect x="32" y="4" width="12" height="18" rx="2" fill="var(--primary)" opacity={0.5} />
          <rect x="32" y="26" width="12" height="18" rx="2" fill="var(--primary)" opacity={0.7} />
        </svg>
      );
    case 'free-canvas':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <rect x="4" y="4" width="40" height="40" rx="2" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4 3" opacity={0.4} />
          <text x="24" y="28" textAnchor="middle" fontSize="10" fill="var(--primary)" opacity={0.6}>Free</text>
        </svg>
      );
  }
}

export default function ComposePresetPicker({
  open,
  onClose,
  onSelect,
  currentPreset,
}: ComposePresetPickerProps) {
  const presetEntries = Object.entries(PRESETS) as [ComposePresetId, (typeof PRESETS)[ComposePresetId]][];

  return (
    <Modal open={open} onClose={onClose} title="Choose Layout Preset">
      <div className="grid grid-cols-3 gap-3 p-4">
        {presetEntries.map(([id, preset]) => (
          <button
            key={id}
            onClick={() => { onSelect(id); onClose(); }}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
              currentPreset === id
                ? 'border-[var(--primary)] bg-[var(--accent)] ring-1 ring-[var(--primary)]'
                : 'border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent)]'
            }`}
          >
            <PresetIcon preset={id} />
            <div className="text-center">
              <div className="text-xs font-semibold text-[var(--text)]">{preset.label}</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{preset.description}</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                {preset.slots === 0 ? 'Custom' : `${preset.slots} slot${preset.slots !== 1 ? 's' : ''}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
