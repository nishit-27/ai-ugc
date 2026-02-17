'use client';

import Spinner from '@/components/ui/Spinner';
import type { Account, Profile } from '@/types';

type VideoOption = { name: string; path: string; url?: string };

type Props = {
  onClose: () => void;
  isLoadingModal: boolean;
  hasVideo: boolean;
  previewVideoSrc: string | null;
  uploadedVideoPath: string | null;
  uploadedVideoName: string | null;
  videos: VideoOption[];
  profiles: Profile[];
  accounts: Account[];
  postForm: { caption: string; videoUrl: string; date: string; time: string };
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  selectedProfiles: string[];
  selectedAccountIds: string[];
  profileSearchQuery: string;
  profileMultiDropdownOpen: boolean;
  postTimezone: string;
  forceRepost: boolean;
  postableAccounts: Account[];
  isPosting: boolean;
  isUploadingVideo: boolean;
  postVideoUploadProgress: number;
  submitLabel: string;
  setUploadedVideoPath: (value: string | null) => void;
  setUploadedVideoPreviewUrl: (value: string | null) => void;
  setUploadedVideoName: (value: string | null) => void;
  setPostForm: React.Dispatch<React.SetStateAction<{ caption: string; videoUrl: string; date: string; time: string }>>;
  setSelectedProfiles: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedAccountIds: React.Dispatch<React.SetStateAction<string[]>>;
  setProfileSearchQuery: (value: string) => void;
  setProfileMultiDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPublishMode: (mode: 'now' | 'schedule' | 'queue' | 'draft') => void;
  setPostTimezone: (value: string) => void;
  setForceRepost: React.Dispatch<React.SetStateAction<boolean>>;
  handleVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploadPostVideoFile: (file: File) => Promise<void>;
  submitPost: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

export default function CreatePostModalContent({
  onClose,
  isLoadingModal,
  hasVideo,
  previewVideoSrc,
  uploadedVideoPath,
  uploadedVideoName,
  videos,
  profiles,
  accounts,
  postForm,
  publishMode,
  selectedProfiles,
  selectedAccountIds,
  profileSearchQuery,
  profileMultiDropdownOpen,
  postTimezone,
  forceRepost,
  postableAccounts,
  isPosting,
  isUploadingVideo,
  postVideoUploadProgress,
  submitLabel,
  setUploadedVideoPath,
  setUploadedVideoPreviewUrl,
  setUploadedVideoName,
  setPostForm,
  setSelectedProfiles,
  setSelectedAccountIds,
  setProfileSearchQuery,
  setProfileMultiDropdownOpen,
  setPublishMode,
  setPostTimezone,
  setForceRepost,
  handleVideoUpload,
  uploadPostVideoFile,
  submitPost,
  showToast,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div
        className="flex h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-2xl sm:h-auto sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h3 className="text-base font-semibold text-[var(--text)]">Create Post</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {isLoadingModal ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Spinner className="h-5 w-5 text-[var(--primary)]" />
            <span className="text-sm text-[var(--text-muted)]">Loading...</span>
          </div>
        ) : (
          <>
            {/* Two-column body */}
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">

              {/* ── Left: Video ── */}
              <div className="flex shrink-0 flex-col border-b border-[var(--border)] bg-[var(--accent)] p-4 md:w-[280px] md:border-b-0 md:border-r md:overflow-y-auto">
                <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">Video</label>

                {/* Preview */}
                {hasVideo && previewVideoSrc && (
                  <div className="relative mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-black">
                    <video
                      src={previewVideoSrc}
                      controls
                      className="mx-auto max-h-52 w-full object-contain"
                    />
                    <button
                      onClick={() => {
                        if (uploadedVideoPath) {
                          setUploadedVideoPath(null);
                          setUploadedVideoPreviewUrl(null);
                          setUploadedVideoName(null);
                        } else {
                          setPostForm((p) => ({ ...p, videoUrl: '' }));
                        }
                      }}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                      title="Remove video"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {uploadedVideoPath && (
                      <div className="flex items-center gap-1.5 bg-[var(--success-bg)] px-2.5 py-1.5">
                        <svg className="h-3.5 w-3.5 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="truncate text-[11px] font-medium text-[var(--success)]">{uploadedVideoName}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Select from generated */}
                {!uploadedVideoPath && (
                  <select
                    value={postForm.videoUrl}
                    onChange={(e) => setPostForm((p) => ({ ...p, videoUrl: e.target.value }))}
                    className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                    disabled={isUploadingVideo}
                  >
                    <option value="">Select generated video...</option>
                    {videos.map((v) => (
                      <option key={v.path} value={v.path}>{v.name}</option>
                    ))}
                  </select>
                )}

                {/* Upload zone */}
                {!uploadedVideoPath && (
                  <>
                    {!postForm.videoUrl && (
                      <div className="my-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">or upload</div>
                    )}
                    <label
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-5 transition-colors ${
                        isUploadingVideo
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 cursor-wait'
                          : 'border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
                      }`}
                      onDragOver={(e) => {
                        if (isUploadingVideo) return;
                        e.preventDefault();
                        e.currentTarget.classList.add('border-[var(--primary)]', 'bg-[var(--background)]');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--background)]');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--background)]');
                        if (isUploadingVideo) return;
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('video/')) {
                          uploadPostVideoFile(file);
                        } else {
                          showToast('Please drop a video file', 'error');
                        }
                      }}
                    >
                      {isUploadingVideo ? (
                        <>
                          <Spinner className="h-6 w-6 text-[var(--primary)]" />
                          <span className="mt-1.5 text-xs font-medium text-[var(--primary)]">
                            {postVideoUploadProgress}%
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">{uploadedVideoName}</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-6 w-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="mt-1 text-xs font-medium text-[var(--text)]">Upload video</span>
                          <span className="text-[10px] text-[var(--text-muted)]">MP4, MOV, WebM</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoUpload}
                        disabled={isUploadingVideo}
                      />
                    </label>
                  </>
                )}
              </div>

              {/* ── Right: Form ── */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto p-4">

                  {/* Caption */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Caption</label>
                    <textarea
                      value={postForm.caption}
                      onChange={(e) => setPostForm((p) => ({ ...p, caption: e.target.value }))}
                      placeholder="Write your caption... #fyp #viral"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
                    />
                  </div>

                  {/* Profiles */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Profiles</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setProfileMultiDropdownOpen((o) => !o)}
                        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {selectedProfiles.length > 0 ? (
                            <>
                              <div className="flex -space-x-1">
                                {profiles.filter((p) => selectedProfiles.includes(p._id)).slice(0, 4).map((p) => (
                                  <div
                                    key={p._id}
                                    className="h-4 w-4 rounded-full border-2 border-[var(--background)]"
                                    style={{ backgroundColor: p.color || '#fcd34d' }}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-[var(--text)]">{selectedProfiles.length} selected</span>
                            </>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">Select profiles...</span>
                          )}
                        </div>
                        <svg className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${profileMultiDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {profileMultiDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
                          <div className="border-b border-[var(--border)] p-2">
                            <input
                              type="text"
                              value={profileSearchQuery}
                              onChange={(e) => setProfileSearchQuery(e.target.value)}
                              placeholder="Search profiles..."
                              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2 border-b border-[var(--border)] px-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedProfiles(profiles.map((p) => p._id))}
                              className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSelectedProfiles([]); setSelectedAccountIds([]); }}
                              className="text-[10px] font-medium text-[var(--text-muted)] hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                          {profiles
                            .filter((p) => !profileSearchQuery || p.name.toLowerCase().includes(profileSearchQuery.toLowerCase()))
                            .map((p) => (
                              <label
                                key={p._id}
                                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[var(--text)] hover:bg-[var(--accent)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProfiles.includes(p._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const newProfiles = [...selectedProfiles, p._id];
                                      setSelectedProfiles(newProfiles);
                                      const newAccounts = accounts.filter((a) => {
                                        const aProfileId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
                                        return aProfileId === p._id && (a.platform === 'tiktok' || a.platform === 'instagram' || a.platform === 'youtube');
                                      });
                                      setSelectedAccountIds((prev) => [...new Set([...prev, ...newAccounts.map((a) => a._id)])]);
                                    } else {
                                      setSelectedProfiles((prev) => prev.filter((id) => id !== p._id));
                                      const profileAccountIds = accounts
                                        .filter((a) => {
                                          const aProfileId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
                                          return aProfileId === p._id;
                                        })
                                        .map((a) => a._id);
                                      setSelectedAccountIds((prev) => prev.filter((id) => !profileAccountIds.includes(id)));
                                    }
                                  }}
                                  className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                                />
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color || '#fcd34d' }} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium">{p.name}</div>
                                </div>
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Accounts */}
                  {postableAccounts.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                        Accounts ({selectedAccountIds.length}/{postableAccounts.length})
                      </label>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {postableAccounts.map((a) => {
                          const isSelected = selectedAccountIds.includes(a._id);
                          return (
                            <label
                              key={a._id}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-2.5 py-2 transition-colors ${
                                isSelected
                                  ? 'border-[var(--primary)] bg-[var(--accent)]'
                                  : 'border-[var(--border)] hover:border-[var(--accent-border)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAccountIds((prev) => [...prev, a._id]);
                                  } else {
                                    setSelectedAccountIds((prev) => prev.filter((id) => id !== a._id));
                                  }
                                }}
                                className="h-3.5 w-3.5 shrink-0 rounded accent-[var(--primary)]"
                              />
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                {a.platform === 'tiktok' ? (
                                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>
                                ) : a.platform === 'youtube' ? (
                                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                                )}
                                {a.profilePicture ? (
                                  <img src={a.profilePicture} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                                ) : (
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-medium text-[var(--text-muted)]">
                                    {(a.username || a.displayName || '?')[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="truncate text-xs text-[var(--text)]">@{a.username || a.displayName}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Publishing */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Publishing</label>
                    <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-1 sm:grid-cols-4">
                      {(['now', 'schedule', 'queue', 'draft'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPublishMode(mode)}
                          className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                            publishMode === mode
                              ? 'bg-[var(--primary)] text-white shadow-sm'
                              : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
                          }`}
                        >
                          {mode === 'now' ? 'Now' : mode === 'schedule' ? 'Schedule' : mode === 'queue' ? 'Queue' : 'Draft'}
                        </button>
                      ))}
                    </div>
                    {publishMode === 'schedule' && (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--text-muted)]">Date</label>
                            <input
                              type="date"
                              value={postForm.date}
                              onChange={(e) => setPostForm((p) => ({ ...p, date: e.target.value }))}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--text-muted)]">Time</label>
                            <input
                              type="time"
                              value={postForm.time}
                              onChange={(e) => setPostForm((p) => ({ ...p, time: e.target.value }))}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-[var(--text-muted)]">Timezone</label>
                          <select
                            value={postTimezone}
                            onChange={(e) => setPostTimezone(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text)] focus:border-[var(--accent-border)] focus:outline-none"
                          >
                            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                            <option value="America/New_York">America/New_York (EST)</option>
                            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                            <option value="Europe/London">Europe/London (GMT)</option>
                            <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                            <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                            <option value="UTC">UTC</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text)]">Force Repost</div>
                          <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                            Allow intentionally posting the same content again.
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={forceRepost}
                          onClick={() => setForceRepost((prev) => !prev)}
                          className={`inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-all ${
                            forceRepost
                              ? 'border-amber-400 bg-amber-100'
                              : 'border-[var(--border)] bg-[var(--background)]'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              forceRepost ? 'translate-x-8' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      {forceRepost && (
                        <div className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          Duplicate prevention is bypassed for this submit only.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer with submit */}
                <div className="shrink-0 border-t border-[var(--border)] p-3 sm:p-4">
                  <button
                    onClick={submitPost}
                    disabled={isPosting || selectedAccountIds.length === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPosting ? (
                      <>
                        <Spinner />
                        {publishMode === 'now' ? 'Publishing...' : publishMode === 'schedule' ? 'Scheduling...' : publishMode === 'draft' ? 'Saving...' : 'Queuing...'}
                      </>
                    ) : submitLabel}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
