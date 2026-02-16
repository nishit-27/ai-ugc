'use client';

import Image from 'next/image';
import { type ReactNode } from 'react';
import { ImageIcon, Link2 } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import type { Model } from '@/types';

const PLATFORM_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3 w-3" />,    color: '#00f2ea' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3 w-3" />, color: '#E1306C' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3 w-3" />,   color: '#FF0000' },
  facebook:  { label: 'Facebook',  icon: <FaFacebook className="h-3 w-3" />,  color: '#1877F2' },
  twitter:   { label: 'X',         icon: <FaXTwitter className="h-3 w-3" />,  color: '#9ca3af' },
  linkedin:  { label: 'LinkedIn',  icon: <FaLinkedin className="h-3 w-3" />,  color: '#0A66C2' },
};

export default function ModelGrid({
  models,
  isLoading,
  onModelClick,
  onNewModel,
}: {
  models: Model[];
  isLoading: boolean;
  onModelClick: (model: Model) => void;
  onNewModel: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="aspect-square bg-[var(--background)]" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-20 rounded bg-[var(--background)]" />
              <div className="h-3 w-14 rounded bg-[var(--background)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-16 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--background)]">
          <ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
        </div>
        <h3 className="mb-1 text-lg font-semibold">No models yet</h3>
        <p className="mb-5 text-sm text-[var(--text-muted)]">Create a model to upload reference images and link social accounts</p>
        <button
          onClick={onNewModel}
          className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          + Create Model
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {models.map((model, index) => {
        const platforms = model.linkedPlatforms || [];
        return (
          <div
            key={model.id}
            onClick={() => onModelClick(model)}
            className="group cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--primary)]/50 hover:shadow-lg"
          >
            {/* Avatar / Hero Image */}
            <div className="relative aspect-square bg-[var(--background)]">
              {model.avatarUrl ? (
                <Image
                  src={model.avatarUrl}
                  alt={model.name}
                  fill
                  priority={index < 4}
                  quality={70}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]/30">
                  <ImageIcon className="h-16 w-16" />
                </div>
              )}

              {/* Image count badge */}
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                <ImageIcon className="h-2.5 w-2.5" />
                {model.imageCount || 0}
              </div>

              {/* Platform icons */}
              {platforms.length > 0 && (
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  {platforms.map((p) => {
                    const meta = PLATFORM_META[p];
                    return (
                      <div
                        key={p}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
                        style={{ color: meta?.color || '#9ca3af' }}
                        title={meta?.label || p}
                      >
                        {meta?.icon || <span className="text-[8px] font-bold text-white">{p.charAt(0).toUpperCase()}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-3">
              <div className="truncate text-sm font-semibold">{model.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span>{model.imageCount || 0} image{(model.imageCount || 0) !== 1 ? 's' : ''}</span>
                {platforms.length > 0 && (
                  <>
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Link2 className="h-2.5 w-2.5" />
                      {platforms.length} account{platforms.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* New model card */}
      <div
        onClick={onNewModel}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-8 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]"
      >
        <div className="mb-2 text-3xl text-[var(--text-muted)]">+</div>
        <div className="text-sm font-medium text-[var(--text-muted)]">New Model</div>
      </div>
    </div>
  );
}
