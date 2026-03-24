'use client';

import { type ReactNode, useState, useRef } from 'react';
import { ImageIcon, Link2 } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Model } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

gsap.registerPlugin(useGSAP);

const PLATFORM_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3 w-3" />,    color: '#00f2ea' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3 w-3" />, color: '#E1306C' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3 w-3" />,   color: '#FF0000' },
  facebook:  { label: 'Facebook',  icon: <FaFacebook className="h-3 w-3" />,  color: '#1877F2' },
  twitter:   { label: 'X',         icon: <FaXTwitter className="h-3 w-3" />,  color: '#9ca3af' },
  linkedin:  { label: 'LinkedIn',  icon: <FaLinkedin className="h-3 w-3" />,  color: '#0A66C2' },
};

function ModelAvatar({
  src,
  alt,
  priority,
}: {
  src?: string;
  alt: string;
  priority: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]/30">
        <ImageIcon className="h-16 w-16" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--background)]">
      {!loaded && (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
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

  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!gridRef.current || models.length === 0) return;
    const cards = gridRef.current.querySelectorAll(':scope > div');
    if (!cards.length) return;
    gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 20, scale: 0.97 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.04, ease: 'power2.out' }
    );
  }, { scope: gridRef, dependencies: [models] });

  return (
    <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {models.map((model, index) => {
        const platforms = model.linkedPlatforms || [];
        const groupNames = model.groupNames?.filter((g) => g.trim()) || [];
        const groupLabel = groupNames.length > 0 ? groupNames.join(', ') : '';
        return (
          <div
            key={model.id}
            onClick={() => onModelClick(model)}
            className="group cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--primary)]/50 hover:shadow-lg will-change-transform"
            style={{ visibility: 'hidden' }}
          >
            {/* Avatar / Hero Image */}
            <div className="relative aspect-[3/4] bg-[var(--background)]">
              <ModelAvatar
                key={model.avatarUrl || `empty-${model.id}`}
                src={model.avatarUrl}
                alt={model.name}
                priority={index < 4}
              />

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

              {/* Bottom gradient with name overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
                {groupLabel && (
                  <span className="mb-1 inline-flex max-w-full truncate rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm">
                    {groupLabel}
                  </span>
                )}
                <div className="truncate text-sm font-semibold text-white">{model.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/70">
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
          </div>
        );
      })}

      {/* New model card */}
      <div
        onClick={onNewModel}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)] will-change-transform"
        style={{ visibility: 'hidden', minHeight: '200px' }}
      >
        <div className="mb-2 text-3xl text-[var(--text-muted)]">+</div>
        <div className="text-sm font-medium text-[var(--text-muted)]">New Model</div>
      </div>
    </div>
  );
}
