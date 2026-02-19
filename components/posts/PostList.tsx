'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, RotateCw, ExternalLink, Copy, AlertTriangle } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaXTwitter } from 'react-icons/fa6';
import type { Post } from '@/types';
import { useToast } from '@/hooks/useToast';
import { getCreatedDateDisplay, getScheduledDateDisplay } from '@/lib/dateUtils';
import { derivePostStatus, isActiveStatus } from '@/lib/postStatus';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import LoadingShimmer from '@/components/ui/LoadingShimmer';
import GlBadge from '@/components/ui/GlBadge';

const PER_PAGE = 16;

type DuplicateLink = { platform: string; postId: string; url?: string; createdAt?: string };

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  instagram: <FaInstagram className="h-3.5 w-3.5" style={{ color: '#E1306C' }} />,
  tiktok: <FaTiktok className="h-3.5 w-3.5" style={{ color: '#00f2ea' }} />,
  youtube: <FaYoutube className="h-3.5 w-3.5" style={{ color: '#FF0000' }} />,
  twitter: <FaXTwitter className="h-3.5 w-3.5" />,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'border-pink-200 bg-pink-50 dark:border-pink-900/40 dark:bg-pink-950/20',
  tiktok: 'border-cyan-200 bg-cyan-50 dark:border-cyan-900/40 dark:bg-cyan-950/20',
  youtube: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20',
  twitter: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/20',
};

function postStatus(post: Post) {
  return post.derivedStatus || derivePostStatus(post);
}

function SkeletonCard() {
  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <LoadingShimmer />
    </div>
  );
}

export default function PostList({
  posts,
  isLoading,
  refresh,
  duplicateIds,
  duplicateMap,
  onCreatePost,
}: {
  posts: Post[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  duplicateIds: Set<string>;
  duplicateMap: Map<string, DuplicateLink[]>;
  onCreatePost: () => void;
}) {
  const { showToast } = useToast();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [page, setPage] = useState(1);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState<string | null>(null);
  const [publishingPost, setPublishingPost] = useState<{ caption?: string; platforms?: string[] } | null>(null);

  // Check for a just-submitted post (on mount and when posts refresh)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ai-ugc-new-post');
      if (raw && !publishingPost) {
        setPublishingPost(JSON.parse(raw));
      }
    } catch {}
  }, [posts, publishingPost]);

  // Dismiss the placeholder once a real active post appears in the list, or after timeout
  useEffect(() => {
    if (!publishingPost) return;
    const hasRecentPost = posts.some((post) => {
      if (!post.createdAt) return false;
      const createdAtMs = Date.parse(post.createdAt);
      if (Number.isNaN(createdAtMs)) return false;
      if (Date.now() - createdAtMs > 2 * 60 * 1000) return false;
      const status = postStatus(post);
      return isActiveStatus(status) || status === 'published' || status === 'scheduled' || status === 'partial' || status === 'failed';
    });
    if (hasRecentPost) {
      setPublishingPost(null);
      try { sessionStorage.removeItem('ai-ugc-new-post'); } catch {}
      return;
    }
    // Auto-dismiss after 30s in case the API failed silently
    const timer = setTimeout(() => {
      setPublishingPost(null);
      try { sessionStorage.removeItem('ai-ugc-new-post'); } catch {}
    }, 30000);
    return () => clearTimeout(timer);
  }, [posts, publishingPost]);

  const livePost = selectedPost ? posts.find((p) => p._id === selectedPost._id) ?? selectedPost : null;

  const totalPages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedPosts = useMemo(
    () => posts.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [posts, safePage],
  );
  const visiblePages = useMemo(
    () =>
      Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
        .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
          if (i > 0 && p - arr[i - 1] > 1) acc.push('dots');
          acc.push(p);
          return acc;
        }, []),
    [safePage, totalPages],
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-muted)]">
        <h3 className="mb-2 font-semibold text-[var(--text)]">No posts yet</h3>
        <p className="mb-4">Create your first post to get started</p>
        <button onClick={onCreatePost} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white hover:bg-[var(--primary-hover)]">
          + Create Post
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {/* Publishing placeholder card */}
        {publishingPost && safePage === 1 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-[var(--surface)] shadow ring-1 ring-amber-300 dark:border-amber-900/50">
            <div
              className="relative w-full bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30"
              style={{ aspectRatio: '9/16' }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
                </div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Publishing...</span>
              </div>
              <div className="absolute left-1.5 top-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm">
                  <Spinner className="h-3.5 w-3.5" />
                  Publishing
                </span>
              </div>
              {publishingPost.platforms && publishingPost.platforms.length > 0 && (
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  {publishingPost.platforms.map((p) => (
                    <span key={p} className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 shadow-sm backdrop-blur-sm">
                      {p === 'tiktok' && <FaTiktok className="h-4 w-4" style={{ color: '#00f2ea' }} />}
                      {p === 'instagram' && <FaInstagram className="h-4 w-4" style={{ color: '#E1306C' }} />}
                      {p === 'youtube' && <FaYoutube className="h-4 w-4" style={{ color: '#FF0000' }} />}
                      {p === 'twitter' && <FaXTwitter className="h-4 w-4 text-white" />}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-medium">{publishingPost.caption || 'New post'}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Just now</p>
            </div>
          </div>
        )}
        {paginatedPosts.map((post) => {
          const status = postStatus(post);
          const thumbnailImage = post.mediaItems?.[0]?.thumbnailUrl;
          const previewVideo = post.mediaItems?.[0]?.url || post.mediaItems?.[0]?.thumbnailUrl;
          const isActive = isActiveStatus(status);
          const isScheduled = status === 'scheduled';
          const isDuplicate = duplicateIds.has(post._id);
          const postAuthor = post.modelName || 'Unknown';

          return (
            <div
              key={post._id}
              onClick={() => setSelectedPost(post)}
              className={`group cursor-pointer overflow-hidden rounded-xl border border-black/[0.08] bg-[var(--surface)] shadow transition-all hover:shadow-lg dark:border-[var(--border)] ${
                isDuplicate ? 'ring-1 ring-purple-400' : isScheduled ? 'ring-1 ring-blue-300' : isActive ? 'ring-1 ring-amber-300' : ''
              }`}
            >
              {/* Thumbnail — 9:16 */}
              <div
                className="relative w-full bg-black/90"
                style={{ aspectRatio: '9/16' }}
              >
                {thumbnailImage ? (
                  <img
                    src={thumbnailImage}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : previewVideo ? (
                  <video
                    src={previewVideo}
                    className="absolute inset-0 h-full w-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] text-white/40">No video</span>
                  </div>
                )}

                {/* Top overlay bar */}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-2 pb-5">
                  {/* Status badge */}
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold shadow-sm ${
                        status === 'published' ? 'bg-emerald-500 text-white' :
                        status === 'failed' ? 'bg-red-500 text-white' :
                        status === 'partial' ? 'bg-orange-500 text-white' :
                        isScheduled ? 'bg-blue-500 text-white' :
                        isActive ? 'bg-amber-500 text-white' :
                        'bg-white/20 text-white backdrop-blur-sm'
                      }`}
                    >
                      {isActive && <Spinner className="h-3.5 w-3.5" />}
                      {isActive ? 'Publishing' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    {isDuplicate && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-md bg-purple-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
                        <Copy className="h-3 w-3" />
                        Duplicate
                      </span>
                    )}
                  </div>

                  {/* Platform chips */}
                  {post.platforms && post.platforms.length > 0 && (
                    <div className="flex gap-1">
                      {post.platforms.map((p, idx) => (
                          <span
                            key={`${p.platform}-${idx}-${typeof p.accountId === 'string' ? p.accountId : p.accountId?._id || 'unknown'}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg shadow-sm bg-black/50 backdrop-blur-sm"
                          >
                            {p.platform === 'tiktok' && <FaTiktok className="h-4 w-4" style={{ color: '#00f2ea' }} />}
                            {p.platform === 'instagram' && <FaInstagram className="h-4 w-4" style={{ color: '#E1306C' }} />}
                            {p.platform === 'youtube' && <FaYoutube className="h-4 w-4" style={{ color: '#FF0000' }} />}
                            {p.platform === 'twitter' && <FaXTwitter className="h-4 w-4 text-white" />}
                          </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Info bar */}
              <div className="bg-[var(--surface)] px-2.5 py-2">
                <p className="truncate text-xs font-medium">{post.content || '(No caption)'}</p>
                {post.createdAt && (
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {getCreatedDateDisplay(post.createdAt)}
                  </p>
                )}
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-[var(--text-muted)]">
                  By {postAuthor}
                  <GlBadge index={post.apiKeyIndex} />
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {visiblePages.map((item, i) =>
            item === 'dots' ? (
              <span key={`dots-${i}`} className="px-1 text-[var(--text-muted)]">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                className={`flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                  item === safePage
                    ? 'bg-[var(--primary)] text-white'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
                }`}
              >
                {item}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        open={!!livePost}
        onClose={() => setSelectedPost(null)}
        title={livePost?.content?.slice(0, 60) || 'Post'}
        maxWidth="max-w-2xl"
      >
        {livePost && (() => {
          const status = postStatus(livePost);
          const videoSrc = livePost.mediaItems?.[0]?.url || livePost.mediaItems?.[0]?.thumbnailUrl;
          const isFailed = status === 'failed' || status === 'partial';
          const isPublished = status === 'published';
          const isLivePostDuplicate = duplicateIds.has(livePost._id);
          const postTz = (livePost as { timezone?: string }).timezone || 'Asia/Kolkata';

          return (
            <div className="flex flex-col sm:flex-row">
              {/* Video — fixed width on desktop, full width on mobile */}
              <div className="w-full sm:w-56 md:w-64 flex-shrink-0 bg-black">
                <div
                  className="relative w-full"
                  style={{ aspectRatio: '9/16' }}
                >
                  {videoSrc ? (
                    <video
                      src={videoSrc}
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-white/40">No video</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info panel — scrollable on desktop */}
              <div className="flex-1 min-w-0 overflow-y-auto sm:max-h-[80vh]">
                <div className="p-4 space-y-3">
                  {/* Status + date row */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isPublished ? 'bg-emerald-50 text-emerald-600' :
                        isFailed ? 'bg-red-50 text-red-600' :
                        status === 'scheduled' ? 'bg-blue-50 text-blue-600' :
                        'bg-[var(--accent)] text-[var(--text-muted)]'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                      {livePost.scheduledFor
                        ? getScheduledDateDisplay(livePost.scheduledFor, postTz)
                        : livePost.createdAt
                          ? getCreatedDateDisplay(livePost.createdAt)
                          : ''}
                    </span>
                  </div>

                  {/* Caption */}
                  {livePost.content && (
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">{livePost.content}</p>
                  )}
                  <p className="text-[11px] text-[var(--text-muted)]">
                    By {livePost.modelName || 'Unknown'}
                  </p>

                  {/* Platform statuses */}
                  {livePost.platforms && livePost.platforms.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Platforms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {livePost.platforms.map((p, idx) => {
                          const pStatus = p.status || 'pending';
                          const platformLinkPending = pStatus === 'published' && !p.platformPostUrl;
                          return (
                            <span
                              key={`${p.platform}-${idx}-${typeof p.accountId === 'string' ? p.accountId : p.accountId?._id || 'unknown'}`}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                                pStatus === 'published' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                pStatus === 'failed' ? 'border-red-200 bg-red-50 text-red-700' :
                                pStatus === 'partial' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                pStatus === 'scheduled' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                'border-[var(--border)] bg-[var(--accent)] text-[var(--text-muted)]'
                              }`}
                            >
                              {p.platform === 'tiktok' && <FaTiktok className="h-3.5 w-3.5" style={{ color: '#00f2ea' }} />}
                              {p.platform === 'instagram' && <FaInstagram className="h-3.5 w-3.5" style={{ color: '#E1306C' }} />}
                              {p.platform === 'youtube' && <FaYoutube className="h-3.5 w-3.5" style={{ color: '#FF0000' }} />}
                              {p.platform === 'twitter' && <FaXTwitter className="h-3.5 w-3.5" />}
                              <span className="capitalize">{p.platform}</span>
                              <span className="text-[9px] opacity-60">({pStatus})</span>
                              {pStatus === 'published' && p.platformPostUrl && (
                                <a href={p.platformPostUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:opacity-70">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {platformLinkPending && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700">
                                  <Spinner className="h-2.5 w-2.5" />
                                </span>
                              )}
                              {pStatus === 'failed' && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setIsRetrying(livePost._id);
                                    try {
                                      const res = await fetch(`/api/late/posts/${livePost._id}/retry`, { method: 'POST' });
                                      const data = await res.json().catch(() => ({} as { error?: string }));
                                      if (!res.ok) throw new Error(data.error || 'Failed to retry');
                                      showToast('Retrying failed platforms...', 'success');
                                      await refresh();
                                      setTimeout(() => { void refresh(); }, 2000);
                                      setTimeout(() => { void refresh(); }, 5000);
                                    } catch (error) {
                                      showToast((error as Error).message || 'Failed to retry', 'error');
                                    } finally {
                                      setIsRetrying(null);
                                    }
                                  }}
                                  disabled={isRetrying === livePost._id}
                                  className="ml-0.5 inline-flex items-center justify-center rounded p-0.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                  title="Retry this platform"
                                >
                                  {isRetrying === livePost._id ? <Spinner className="h-3 w-3" /> : <RotateCw className="h-3 w-3" />}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Duplicate section ── */}
                  {isLivePostDuplicate && (() => {
                    const siblings = duplicateMap.get(livePost._id) || [];
                    const byPlatform = new Map<string, DuplicateLink[]>();
                    for (const s of siblings) {
                      const list = byPlatform.get(s.platform);
                      if (list) list.push(s);
                      else byPlatform.set(s.platform, [s]);
                    }

                    return (
                      <div className="rounded-lg border border-purple-200 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/20">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-200/60 dark:border-purple-900/30">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-purple-500 dark:text-purple-400" />
                          <div>
                            <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">Duplicate caption detected</p>
                            <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70">Same caption found on the same account</p>
                          </div>
                        </div>
                        <div className="divide-y divide-purple-200/40 dark:divide-purple-900/20">
                          {Array.from(byPlatform.entries()).map(([platform, links]) => (
                            <div key={platform} className="px-3 py-2.5 space-y-2">
                              <div className="flex items-center gap-1.5">
                                {PLATFORM_ICON[platform] || null}
                                <span className="text-[11px] font-semibold capitalize text-[var(--text)]">{platform}</span>
                                <span className="rounded-full bg-purple-200/60 px-1.5 py-0.5 text-[9px] font-medium text-purple-700 dark:bg-purple-800/40 dark:text-purple-300">
                                  {links.length} duplicate{links.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="grid gap-1.5">
                                {links.map((link, i) => (
                                  link.url ? (
                                    <a
                                      key={`${link.postId}-${i}`}
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-all hover:shadow-sm ${PLATFORM_COLORS[platform] || 'border-gray-200 bg-gray-50'}`}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="flex-1 truncate">View on {platform}</span>
                                      {link.createdAt && (
                                        <span className="flex-shrink-0 text-[10px] opacity-50">
                                          {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </a>
                                  ) : (
                                    <span
                                      key={`${link.postId}-${i}`}
                                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium opacity-60 ${PLATFORM_COLORS[platform] || 'border-gray-200 bg-gray-50'}`}
                                    >
                                      <Copy className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="flex-1 truncate">Same caption (no link yet)</span>
                                      {link.createdAt && (
                                        <span className="flex-shrink-0 text-[10px] opacity-50">
                                          {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </span>
                                  )
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this post?')) return;
                        setIsDeletingPost(livePost._id);
                        try {
                          const res = await fetch(`/api/late/posts/${livePost._id}`, { method: 'DELETE' });
                          const data = await res.json().catch(() => ({} as { error?: string }));
                          if (!res.ok) {
                            throw new Error(data.error || 'Failed to delete post');
                          }
                          showToast('Post deleted', 'success');
                          setSelectedPost(null);
                          await refresh();
                        } catch (error) {
                          showToast((error as Error).message || 'Failed to delete post', 'error');
                        } finally {
                          setIsDeletingPost(null);
                        }
                      }}
                      disabled={isDeletingPost === livePost._id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      {isDeletingPost === livePost._id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
