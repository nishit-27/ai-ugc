'use client';

import { Upload, ImageIcon, Video, Sparkles } from 'lucide-react';
import type { TwitterMediaConfig } from '@/types';

interface MediaStepConfigProps {
  config: TwitterMediaConfig;
  onChange: (config: Partial<TwitterMediaConfig>) => void;
}

export default function MediaStepConfig({ config, onChange }: MediaStepConfigProps) {
  const SOURCE_OPTIONS = [
    { value: 'upload' as const, label: 'Upload', icon: Upload, desc: 'Upload from device' },
    { value: 'library' as const, label: 'Library', icon: ImageIcon, desc: 'Pick from /images or /videos' },
    { value: 'generate' as const, label: 'Generate', icon: Sparkles, desc: 'AI-generate media' },
  ];

  return (
    <div className="space-y-4">
      {/* Source selector */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">Media Source</label>
        <div className="grid grid-cols-3 gap-2">
          {SOURCE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = config.source === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onChange({ source: option.value })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                  isActive
                    ? 'border-[#F45D22] bg-[#F45D22]/10 text-[#F45D22]'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload area */}
      {config.source === 'upload' && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-12 transition-colors hover:border-[#F45D22]">
          <Upload className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">Drag & drop or click to upload</p>
          <p className="text-xs text-[var(--text-muted)]">Images, videos, GIFs</p>
        </div>
      )}

      {/* Library picker */}
      {config.source === 'library' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <a
              href="/images"
              target="_blank"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-6 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ImageIcon className="h-5 w-5" />
              Browse Images
            </a>
            <a
              href="/videos"
              target="_blank"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-6 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <Video className="h-5 w-5" />
              Browse Videos
            </a>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Or paste media URL</label>
            <input
              type="text"
              value={config.mediaUrl || ''}
              onChange={(e) => onChange({ mediaUrl: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Generate settings */}
      {config.source === 'generate' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Prompt</label>
            <textarea
              value={config.generatePrompt || ''}
              onChange={(e) => onChange({ generatePrompt: e.target.value })}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#F45D22] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Provider</label>
            <div className="flex gap-2">
              {(['fal', 'gpt-image', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => onChange({ generateProvider: p })}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    config.generateProvider === p
                      ? 'bg-[#F45D22] text-white'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {p === 'gpt-image' ? 'GPT Image' : p === 'fal' ? 'FAL' : 'Gemini'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {config.mediaUrl && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <img src={config.mediaUrl} alt="" className="h-40 w-full object-cover" />
        </div>
      )}
    </div>
  );
}
