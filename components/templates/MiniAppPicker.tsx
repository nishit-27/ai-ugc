'use client';

import { Video, Type, Music, Film } from 'lucide-react';
import type { MiniAppType, MiniAppStep, VideoGenConfig, TextOverlayConfig, BgMusicConfig, AttachVideoConfig } from '@/types';

const miniApps: {
  type: MiniAppType;
  label: string;
  description: string;
  icon: typeof Video;
  iconBg: string;
  iconColor: string;
}[] = [
  { type: 'video-generation', label: 'Video Generation', description: 'AI-powered motion or animation', icon: Video, iconBg: '#f3f0ff', iconColor: '#7c3aed' },
  { type: 'text-overlay',     label: 'Text Overlay',     description: 'Styled text at any position',    icon: Type,  iconBg: '#eff6ff', iconColor: '#2563eb' },
  { type: 'bg-music',         label: 'Background Music', description: 'Mix audio with fade control',    icon: Music, iconBg: '#ecfdf5', iconColor: '#059669' },
  { type: 'attach-video',     label: 'Attach Video',     description: 'Prepend or append a clip',       icon: Film,  iconBg: '#fff7ed', iconColor: '#ea580c' },
];

function createDefaultConfig(type: MiniAppType): VideoGenConfig | TextOverlayConfig | BgMusicConfig | AttachVideoConfig {
  switch (type) {
    case 'video-generation': return { mode: 'motion-control' } as VideoGenConfig;
    case 'text-overlay':     return { text: '', position: 'bottom', textAlign: 'center', fontSize: 48, fontColor: '#FFFFFF', entireVideo: true } as TextOverlayConfig;
    case 'bg-music':         return { volume: 30 } as BgMusicConfig;
    case 'attach-video':     return { videoUrl: '', position: 'after' } as AttachVideoConfig;
  }
}

export default function MiniAppPicker({ onAdd }: { onAdd: (step: MiniAppStep) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {miniApps.map((app) => {
        const Icon = app.icon;
        return (
          <button
            key={app.type}
            onClick={() => onAdd({
              id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: app.type,
              config: createDefaultConfig(app.type),
              enabled: true,
            })}
            className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-all duration-150 hover:border-[var(--accent-border)] hover:bg-[var(--accent)] hover:shadow-sm"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: app.iconBg }}
            >
              <Icon className="h-5 w-5" style={{ color: app.iconColor }} />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-sm font-semibold text-[var(--text)]">{app.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">{app.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
