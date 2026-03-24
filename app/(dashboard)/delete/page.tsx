'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageTransition from '@/components/ui/PageTransition';
import {
  Search,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckSquare,
  Square,
  Loader2,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import type { Model, Post, PostPlatform } from '@/types';

const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3.5 w-3.5" />,    color: '#00f2ea' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3.5 w-3.5" />, color: '#E1306C' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3.5 w-3.5" />,   color: '#FF0000' },
  facebook:  { label: 'Facebook',  icon: <FaFacebook className="h-3.5 w-3.5" />,  color: '#1877F2' },
  twitter:   { label: 'X',         icon: <FaXTwitter className="h-3.5 w-3.5" />,  color: '#9ca3af' },
  linkedin:  { label: 'LinkedIn',  icon: <FaLinkedin className="h-3.5 w-3.5" />,  color: '#0A66C2' },
};

const PER_PAGE = 12;

type AccountMapping = { lateAccountId: string; platform: string; apiKeyIndex?: number };
type PlatformPost = Post & { platformEntry: PostPlatform };

function getAccountId(accountId: string | { _id: string } | undefined): string {
  if (!accountId) return '';
  return typeof accountId === 'object' ? accountId._id : accountId;
}

type MediaItem = { type?: string; url?: string; thumbnailUrl?: string };

function MediaCarousel({ items }: { items: MediaItem[] }) {
  const [idx, setIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const safeIdx = Math.min(idx, items.length - 1);
  const item = items[safeIdx];
  const isVideo = item?.type === 'video' || (item?.url && /\.(mp4|mov|webm)/i.test(item.url));

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted((m) => !m);
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  return (
    <div className="relative h-full w-full">
      {isVideo && item?.url ? (
        <>
          <video
            ref={videoRef}
            key={item.url}
            src={item.url}
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
          <button
            onClick={toggleMute}
            className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </>
      ) : item?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : item?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-10 w-10 text-white/10" />
        </div>
      )}

      {items.length > 1 && (
        <>
          {/* Left / Right arrows */}
          {safeIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
              className="absolute left-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {safeIdx < items.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(items.length - 1, i + 1)); }}
              className="absolute right-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIdx ? 'w-3 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DeletePage() {
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [accountMappings, setAccountMappings] = useState<AccountMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postSearch, setPostSearch] = useState('');
  const [page, setPage] = useState(1);

  const [postsCache, setPostsCache] = useState<Map<string, { posts: Post[]; ts: number }>>(new Map());
  const POSTS_CACHE_TTL = 5 * 60_000;

  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [deleteResults, setDeleteResults] = useState<Map<string, { success: boolean; error?: string }>>(new Map());
  const [confirmDialog, setConfirmDialog] = useState<{ postIds: string[]; platform: string } | null>(null);

  // Load models
  useEffect(() => {
    fetch('/api/models', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setModels(data.models || data || []))
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  // Load account mappings
  useEffect(() => {
    if (!selectedModelId) { setAccountMappings([]); return; }
    setMappingsLoading(true);
    setSelectedPlatform(null);
    setSelectedAccountId(null);
    setPosts([]);
    setSelectedPostIds(new Set());
    setPage(1);
    fetch(`/api/models/${selectedModelId}/accounts`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setAccountMappings(Array.isArray(data) ? data : data.mappings || []))
      .catch(() => setAccountMappings([]))
      .finally(() => setMappingsLoading(false));
  }, [selectedModelId]);

  // Load posts (cached)
  const loadPosts = useCallback(async (forceRefresh = false) => {
    if (!selectedPlatform) return;
    setSelectedPostIds(new Set());
    setDeleteResults(new Map());
    setPage(1);

    const cacheKey = selectedPlatform;
    if (!forceRefresh) {
      const cached = postsCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < POSTS_CACHE_TTL) {
        const filtered = selectedAccountId
          ? cached.posts.filter((p) => p.platforms?.some((pl) => pl.platform === selectedPlatform && getAccountId(pl.accountId) === selectedAccountId))
          : cached.posts;
        setPosts(filtered);
        return;
      }
    }

    setPostsLoading(true);
    try {
      const res = await fetch(`/api/late/posts?status=published&platform=${selectedPlatform}`, { cache: 'no-store' });
      const data = await res.json();
      const allPosts: Post[] = data.posts || [];
      setPostsCache((prev) => { const n = new Map(prev); n.set(cacheKey, { posts: allPosts, ts: Date.now() }); return n; });
      const filtered = selectedAccountId
        ? allPosts.filter((p) => p.platforms?.some((pl) => pl.platform === selectedPlatform && getAccountId(pl.accountId) === selectedAccountId))
        : allPosts;
      setPosts(filtered);
    } catch { setPosts([]); }
    finally { setPostsLoading(false); }
  }, [selectedPlatform, selectedAccountId, postsCache, POSTS_CACHE_TTL]);

  useEffect(() => { if (selectedPlatform) loadPosts(); }, [selectedPlatform, selectedAccountId, loadPosts]);

  // Filtered & paginated
  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return q ? models.filter((m) => m.name.toLowerCase().includes(q) || (m.groupNames || []).some((g) => g.toLowerCase().includes(q))) : models;
  }, [models, modelSearch]);

  const platformPosts: PlatformPost[] = useMemo(() => {
    const q = postSearch.trim().toLowerCase();
    const filtered = q
      ? posts.filter((p) => (p.content || '').toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q))
      : posts;
    return filtered
      .map((p) => {
        const entry = p.platforms?.find((pl) => pl.platform === selectedPlatform && (!selectedAccountId || getAccountId(pl.accountId) === selectedAccountId));
        return entry ? { ...p, platformEntry: entry } as PlatformPost : null;
      })
      .filter((p): p is PlatformPost => p !== null);
  }, [posts, postSearch, selectedPlatform, selectedAccountId]);

  const totalPages = Math.max(1, Math.ceil(platformPosts.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedPosts = platformPosts.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Reset page on search change
  useEffect(() => { setPage(1); }, [postSearch]);

  // Selection (scoped to current page for Select All, but selection persists across pages)
  const pageIds = pagedPosts.map((p) => p._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedPostIds.has(id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedPostIds((prev) => { const n = new Set(prev); pageIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelectedPostIds((prev) => { const n = new Set(prev); pageIds.forEach((id) => n.add(id)); return n; });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedPostIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Unpublish
  const executeUnpublish = async (postIds: string[], platform: string) => {
    setConfirmDialog(null);
    const newDeleting = new Set(deleting);
    postIds.forEach((id) => newDeleting.add(id));
    setDeleting(new Set(newDeleting));
    const results = new Map(deleteResults);

    for (const postId of postIds) {
      try {
        const res = await fetch(`/api/late/posts/${postId}/unpublish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
        const data = await res.json();
        results.set(postId, res.ok ? { success: true } : { success: false, error: data.error || 'Failed' });
      } catch (err) {
        results.set(postId, { success: false, error: (err as Error).message });
      }
      newDeleting.delete(postId);
      setDeleting(new Set(newDeleting));
      setDeleteResults(new Map(results));
    }

    const successIds = new Set(Array.from(results.entries()).filter(([, r]) => r.success).map(([id]) => id));
    setPosts((prev) => prev.filter((p) => !successIds.has(p._id)));
    setSelectedPostIds((prev) => { const n = new Set(prev); successIds.forEach((id) => n.delete(id)); return n; });
    if (successIds.size > 0) {
      setPostsCache((prev) => {
        const n = new Map(prev);
        for (const [key, entry] of n) {
          const f = entry.posts.filter((p) => !successIds.has(p._id));
          if (f.length !== entry.posts.length) n.set(key, { ...entry, posts: f });
        }
        return n;
      });
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const uniquePlatforms = useMemo(() => {
    const seen = new Map<string, { accountId: string; apiKeyIndex?: number }>();
    for (const m of accountMappings) {
      if (!seen.has(m.platform)) seen.set(m.platform, { accountId: m.lateAccountId, apiKeyIndex: m.apiKeyIndex });
    }
    return Array.from(seen.entries()).map(([platform, info]) => ({ platform, accountId: info.accountId, apiKeyIndex: info.apiKeyIndex }));
  }, [accountMappings]);

  const deletedCount = Array.from(deleteResults.values()).filter((r) => r.success).length;
  const failedCount = Array.from(deleteResults.values()).filter((r) => !r.success).length;
  const meta = selectedPlatform ? PLATFORM_META[selectedPlatform] : null;

  return (
    <PageTransition className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--primary)]">Delete Videos</h1>
            <p className="text-[11px] text-[var(--text-muted)]">Select a model, pick a platform, then remove published videos</p>
          </div>
          {selectedPostIds.size > 0 && (
            <button
              onClick={() => selectedPlatform && setConfirmDialog({ postIds: Array.from(selectedPostIds), platform: selectedPlatform })}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600"
            >
              <Trash2 className="h-4 w-4" />
              Delete {selectedPostIds.size} Selected
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* ── Left Sidebar ── */}
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
          {/* Model search */}
          <div className="shrink-0 border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Model list */}
          <div className="flex-1 overflow-y-auto p-2">
            {modelsLoading && (
              <div className="flex items-center justify-center py-10 text-xs text-[var(--text-muted)]">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading...
              </div>
            )}
            {!modelsLoading && filteredModels.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">{modelSearch ? 'No match' : 'No models'}</p>
            )}
            <div className="space-y-0.5">
              {filteredModels.map((model) => {
                const active = selectedModelId === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      active ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {model.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={model.avatarUrl} alt="" className={`h-8 w-8 shrink-0 rounded-full object-cover ring-2 ${active ? 'ring-[var(--primary)]/40' : 'ring-transparent'}`} />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-[10px] font-bold text-[var(--text-muted)]">
                        {model.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{model.name}</div>
                      {model.groupNames && model.groupNames.length > 0 && (
                        <div className="truncate text-[10px] text-[var(--text-muted)]">{model.groupNames[0]}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform picker */}
          {selectedModelId && (
            <div className="shrink-0 border-t border-[var(--border)] p-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                {selectedModel?.name || 'Model'}
              </p>
              {mappingsLoading ? (
                <div className="flex items-center justify-center py-3 text-xs text-[var(--text-muted)]"><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Loading...</div>
              ) : uniquePlatforms.length === 0 ? (
                <p className="py-2 text-center text-[10px] text-[var(--text-muted)]">No accounts</p>
              ) : (
                <div className="space-y-1">
                  {uniquePlatforms.map(({ platform, accountId, apiKeyIndex }) => {
                    const pm = PLATFORM_META[platform];
                    const active = selectedPlatform === platform;
                    return (
                      <button
                        key={platform}
                        onClick={() => { setSelectedPlatform(platform); setSelectedAccountId(accountId); setPostSearch(''); }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all ${
                          active
                            ? 'border border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm'
                            : 'border border-transparent text-[var(--text)] hover:bg-[var(--accent)]'
                        }`}
                      >
                        <span style={{ color: pm?.color }}>{pm?.icon}</span>
                        <span className="flex-1 text-xs font-medium">{pm?.label || platform}</span>
                        {apiKeyIndex !== undefined && (
                          <span className="rounded-full bg-zinc-700 px-1.5 py-0.5 text-[9px] font-medium leading-none text-zinc-300">
                            GL-{apiKeyIndex + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedPlatform ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]">
                  <Video className="h-7 w-7 text-[var(--text-muted)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text)]">Select a model &amp; platform</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pick from the sidebar to browse published videos</p>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
                <div className="flex items-center gap-3">
                  {/* Platform badge */}
                  <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1" style={{ borderColor: `${meta?.color}40` }}>
                    <span style={{ color: meta?.color }}>{meta?.icon}</span>
                    <span className="text-xs font-semibold" style={{ color: meta?.color }}>{meta?.label}</span>
                  </div>

                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={postSearch}
                      onChange={(e) => setPostSearch(e.target.value)}
                      placeholder="Filter by caption..."
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs focus:border-[var(--primary)]/50 focus:outline-none"
                    />
                  </div>

                  {/* Select page */}
                  <button
                    onClick={toggleSelectAll}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                      allPageSelected
                        ? 'border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {allPageSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    {allPageSelected ? 'Deselect Page' : 'Select Page'}
                  </button>

                  <button
                    onClick={() => loadPosts(true)}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)]"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${postsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Status row */}
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="text-[var(--text-muted)]">
                    {postsLoading ? 'Loading...' : `${platformPosts.length} video${platformPosts.length !== 1 ? 's' : ''}`}
                  </span>
                  {selectedPostIds.size > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {selectedPostIds.size} selected
                    </span>
                  )}
                  {deletedCount > 0 && <span className="text-green-600 dark:text-green-400">{deletedCount} deleted</span>}
                  {failedCount > 0 && <span className="text-red-600 dark:text-red-400">{failedCount} failed</span>}
                  <span className="ml-auto text-[var(--text-muted)]">
                    Page {safePage} of {totalPages}
                  </span>
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {postsLoading && (
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                        <div className="aspect-[9/16] animate-pulse bg-[var(--accent)]" />
                        <div className="space-y-2 p-3"><div className="h-3 w-3/4 animate-pulse rounded bg-[var(--accent)]" /><div className="h-3 w-1/2 animate-pulse rounded bg-[var(--accent)]" /></div>
                      </div>
                    ))}
                  </div>
                )}

                {!postsLoading && platformPosts.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-20">
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-3 h-10 w-10 text-[var(--text-muted)]/20" />
                      <p className="text-sm font-medium text-[var(--text-muted)]">No published videos found</p>
                    </div>
                  </div>
                )}

                {!postsLoading && pagedPosts.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {pagedPosts.map((post) => {
                      const isSelected = selectedPostIds.has(post._id);
                      const isDeleting = deleting.has(post._id);
                      const result = deleteResults.get(post._id);
                      const mediaItems = post.mediaItems || [];
                      const caption = post.content || post.title || '';

                      return (
                        <div
                          key={post._id}
                          className={`group overflow-hidden rounded-xl border transition-all ${
                            isSelected
                              ? 'border-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.3)] dark:border-red-600'
                              : 'border-[var(--border)] hover:border-[var(--border-hover,var(--border))] hover:shadow-md'
                          } ${isDeleting ? 'pointer-events-none opacity-50' : ''} bg-[var(--surface)]`}
                        >
                          {/* Media area */}
                          <div className="relative aspect-[9/16] bg-black">
                            {mediaItems.length > 0 ? (
                              <MediaCarousel items={mediaItems} />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ImageIcon className="h-10 w-10 text-white/10" />
                              </div>
                            )}

                            {/* Top bar: checkbox + external link */}
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleSelect(post._id); }}
                                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                                  isSelected ? 'bg-red-500 text-white' : 'bg-black/40 text-white/80 hover:bg-black/60'
                                }`}
                              >
                                {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                              </button>
                              {post.platformEntry.platformPostUrl && (
                                <a
                                  href={post.platformEntry.platformPostUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-black/40 text-white/80 transition-colors hover:bg-black/60"
                                  title="View on platform"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>

                            {/* Deleting overlay */}
                            {isDeleting && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                <Loader2 className="h-8 w-8 animate-spin text-white" />
                              </div>
                            )}

                            {/* Result overlay */}
                            {result && (
                              <div className={`absolute inset-x-0 bottom-0 px-3 py-2 text-xs font-medium ${
                                result.success ? 'bg-green-600/90 text-white' : 'bg-red-600/90 text-white'
                              }`}>
                                {result.success ? 'Deleted' : `Error: ${result.error?.slice(0, 60)}`}
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="p-3">
                            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                              {post.publishedAt && (
                                <span>{new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--text)]">
                              {caption || <span className="italic text-[var(--text-muted)]">No caption</span>}
                            </p>

                            {!result?.success && (
                              <button
                                onClick={() => selectedPlatform && setConfirmDialog({ postIds: [post._id], platform: selectedPlatform })}
                                disabled={isDeleting}
                                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-50 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Showing {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, platformPosts.length)} of {platformPosts.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 7) {
                          pageNum = i + 1;
                        } else if (safePage <= 4) {
                          pageNum = i + 1;
                        } else if (safePage >= totalPages - 3) {
                          pageNum = totalPages - 6 + i;
                        } else {
                          pageNum = safePage - 3 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`min-w-[32px] rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                              safePage === pageNum
                                ? 'bg-[var(--primary)] text-white'
                                : 'text-[var(--text-muted)] hover:bg-[var(--accent)]'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Confirm Dialog ── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDialog(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text)]">Delete {confirmDialog.postIds.length} video{confirmDialog.postIds.length !== 1 ? 's' : ''}?</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  This will remove them from {PLATFORM_META[confirmDialog.platform]?.label || confirmDialog.platform}.
                </p>
              </div>
            </div>

            {confirmDialog.platform === 'youtube' && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                YouTube deletions are <strong>permanent</strong> and cannot be undone.
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)]">
                Cancel
              </button>
              <button
                onClick={() => executeUnpublish(confirmDialog.postIds, confirmDialog.platform)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
