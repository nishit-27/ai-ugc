'use client';

import { useRef, useState } from 'react';
import { Upload, ImageIcon, Video, Sparkles, X, Loader2 } from 'lucide-react';
import type { TwitterMediaConfig, TwitterPipelineStep } from '@/types';

const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

const STEP_LABELS: Record<string, string> = {
  tweet: 'Tweet',
  thread: 'Thread',
  reply: 'Reply',
  quote: 'Quote',
};

interface MediaStepConfigProps {
  config: TwitterMediaConfig;
  onChange: (config: Partial<TwitterMediaConfig>) => void;
  onUploadMedia: (file: File) => Promise<string | null>;
  steps: TwitterPipelineStep[];
  currentStepId: string;
}

export default function MediaStepConfig({ config, onChange, onUploadMedia, steps, currentStepId }: MediaStepConfigProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SOURCE_OPTIONS = [
    { value: 'upload' as const, label: 'Upload', icon: Upload, desc: 'Upload from device' },
    { value: 'library' as const, label: 'Library', icon: ImageIcon, desc: 'Pick from /images or /videos' },
    { value: 'generate' as const, label: 'Generate', icon: Sparkles, desc: 'AI-generate media' },
  ];

  // Content steps this media can be attached to (exclude other media steps).
  const attachableSteps = steps.filter((s) => s.id !== currentStepId && s.type !== 'media');

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const url = await onUploadMedia(file);
    if (url) {
      onChange({ mediaUrl: url, mediaType: VIDEO_RE.test(url) ? 'video' : 'image' });
    } else {
      setError(`Failed to upload ${file.name}`);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const isVideo = config.mediaUrl ? VIDEO_RE.test(config.mediaUrl) || config.mediaType === 'video' : false;

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
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-12 transition-colors hover:border-[#F45D22] disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-[#F45D22]" />
                <p className="text-sm text-[var(--text-muted)]">Uploading...</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-muted)]">Click to upload</p>
                <p className="text-xs text-[var(--text-muted)]">Images & videos (max 200MB)</p>
              </>
            )}
          </button>
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
              onChange={(e) => onChange({ mediaUrl: e.target.value, mediaType: VIDEO_RE.test(e.target.value) ? 'video' : 'image' })}
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
          <p className="text-[11px] text-[var(--text-muted)]">
            Generate happens when the pipeline runs. For now you can also upload or paste a URL above.
          </p>
        </div>
      )}

      {/* Preview */}
      {config.mediaUrl && (
        <div className="relative overflow-hidden rounded-xl border border-[var(--border)]">
          {isVideo ? (
            <video src={config.mediaUrl} className="h-40 w-full object-cover" controls muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.mediaUrl} alt="" className="h-40 w-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange({ mediaUrl: '' })}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attach target */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Attach to step</label>
        <select
          value={config.attachToStepId || ''}
          onChange={(e) => onChange({ attachToStepId: e.target.value || undefined })}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#F45D22] focus:outline-none"
        >
          <option value="">Previous content step (auto)</option>
          {attachableSteps.map((s) => (
            <option key={s.id} value={s.id}>
              {STEP_LABELS[s.type] || s.type} #{steps.findIndex((x) => x.id === s.id) + 1}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          This media is added to the chosen tweet/reply/quote when the pipeline runs.
        </p>
      </div>
    </div>
  );
}
