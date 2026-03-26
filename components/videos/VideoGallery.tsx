'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlayCircle } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { GeneratedVideo } from '@/hooks/useGeneratedVideos';
import LoadingShimmer from '@/components/ui/LoadingShimmer';

gsap.registerPlugin(useGSAP);

function formatDate(iso: string) {
  const value = +new Date(iso);
  if (!Number.isFinite(value) || value <= 0) return 'Unknown date';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SkeletonCard() {
  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <LoadingShimmer />
    </div>
  );
}

/** Single lazy video card — only loads & plays when visible in viewport */
function LazyVideoCard({
  video,
  onVideoClick,
}: {
  video: GeneratedVideo;
  onVideoClick: (video: GeneratedVideo) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const displayUrl = video.signedUrl || video.gcsUrl;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          videoRef.current?.play().catch(() => {});
        } else {
          videoRef.current?.pause();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const markLoaded = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div
      ref={cardRef}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-lg"
      onClick={() => onVideoClick(video)}
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-[var(--accent)]">
        {displayUrl ? (
          <>
            <video
              ref={videoRef}
              src={isVisible ? displayUrl : undefined}
              loop
              muted
              playsInline
              preload="metadata"
              onLoadedData={markLoaded}
              onError={markLoaded}
              className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {!isLoaded && <LoadingShimmer />}
          </>
        ) : (
          <LoadingShimmer />
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 transition-opacity group-hover:opacity-100">
          <PlayCircle className="h-10 w-10 text-white/90" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-4">
        <p className="truncate text-[11px] font-medium text-white/95">{video.filename}</p>
        <p className="truncate text-[10px] text-white/85">{video.createdBy ? `By ${video.createdBy}` : 'By Unknown'}</p>
        <p className="text-[10px] text-white/75">{formatDate(video.createdAt)}</p>
      </div>
    </div>
  );
}

export default function VideoGallery({
  videos,
  isLoading,
  onVideoClick,
}: {
  videos: GeneratedVideo[];
  isLoading: boolean;
  onVideoClick: (video: GeneratedVideo) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!gridRef.current || videos.length === 0) return;
    const cards = gridRef.current.querySelectorAll(':scope > div');
    if (!cards.length) return;
    gsap.fromTo(cards,
      { autoAlpha: 0, y: 20 },
      { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.035, ease: 'power2.out' }
    );
  }, { scope: gridRef, dependencies: [videos] });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20 text-center">
        <p className="text-lg font-medium text-[var(--text)]">No generated videos yet</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Completed generated videos will appear here
        </p>
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {videos.map((video) => (
        <LazyVideoCard key={video.id} video={video} onVideoClick={onVideoClick} />
      ))}
    </div>
  );
}
