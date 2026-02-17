'use client';

import { useState, useEffect, useRef } from 'react';
import type { Profile, Account } from '@/types';
import { useToast } from '@/hooks/useToast';
import { uploadVideoDirectToGcs } from '@/lib/gcsResumableUpload';
import CreatePostModalContent from '@/components/posts/CreatePostModalContent';

const SUBMIT_DEDUPE_STORAGE_KEY = 'ai-ugc-post-submit-dedupe-v1';
const SUBMIT_DEDUPE_WINDOW_MS = 30_000;

type SubmitDedupeStore = Record<string, number>;

function readSubmitDedupeStore(): SubmitDedupeStore {
  try {
    const raw = sessionStorage.getItem(SUBMIT_DEDUPE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as SubmitDedupeStore : {};
  } catch {
    return {};
  }
}

function writeSubmitDedupeStore(store: SubmitDedupeStore) {
  try {
    sessionStorage.setItem(SUBMIT_DEDUPE_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function pruneSubmitDedupeStore(store: SubmitDedupeStore, nowMs: number) {
  for (const key of Object.keys(store)) {
    if (nowMs - store[key] > SUBMIT_DEDUPE_WINDOW_MS) delete store[key];
  }
}

function createPostSubmitFingerprint(payload: {
  videoUrl: string;
  caption: string;
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  selectedAccountIds: string[];
  scheduledFor?: string;
  timezone?: string;
  forceRepost?: boolean;
}) {
  return JSON.stringify({
    videoUrl: payload.videoUrl,
    caption: payload.caption.trim(),
    publishMode: payload.publishMode,
    selectedAccountIds: [...payload.selectedAccountIds].sort(),
    scheduledFor: payload.scheduledFor || null,
    timezone: payload.timezone || null,
    forceRepost: !!payload.forceRepost,
  });
}

function markSubmitFingerprint(fingerprint: string, nowMs = Date.now()) {
  const store = readSubmitDedupeStore();
  pruneSubmitDedupeStore(store, nowMs);
  store[fingerprint] = nowMs;
  writeSubmitDedupeStore(store);
}

function hasRecentSubmitFingerprint(fingerprint: string, nowMs = Date.now()) {
  const store = readSubmitDedupeStore();
  pruneSubmitDedupeStore(store, nowMs);
  writeSubmitDedupeStore(store);
  const timestamp = store[fingerprint];
  return typeof timestamp === 'number' && nowMs - timestamp <= SUBMIT_DEDUPE_WINDOW_MS;
}

function clearSubmitFingerprint(fingerprint: string) {
  const store = readSubmitDedupeStore();
  if (!(fingerprint in store)) return;
  delete store[fingerprint];
  writeSubmitDedupeStore(store);
}

export default function CreatePostModal({
  open,
  onClose,
  onSubmitted,
  preselectedVideoUrl,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  preselectedVideoUrl?: string | null;
}) {
  const { showToast } = useToast();

  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [videos, setVideos] = useState<{ name: string; path: string; url?: string }[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [postForm, setPostForm] = useState({ caption: '', videoUrl: '', date: '', time: '' });
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'queue' | 'draft'>('now');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [profileMultiDropdownOpen, setProfileMultiDropdownOpen] = useState(false);
  const [postTimezone, setPostTimezone] = useState('Asia/Kolkata');
  const [forceRepost, setForceRepost] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [postVideoUploadProgress, setPostVideoUploadProgress] = useState<number>(0);
  const [uploadedVideoPath, setUploadedVideoPath] = useState<string | null>(null);
  const [uploadedVideoPreviewUrl, setUploadedVideoPreviewUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);
  const submitGuardRef = useRef(false);

  // Derived
  const selectedProfileAccounts = accounts.filter((a) => {
    const pId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
    return pId && selectedProfiles.includes(pId);
  });
  const postableAccounts = selectedProfileAccounts.filter(
    (a) => a.platform === 'tiktok' || a.platform === 'instagram' || a.platform === 'youtube'
  );

  useEffect(() => {
    if (!open) return;
    setIsLoadingModal(true);
    Promise.all([
      fetch('/api/videos').then((r) => r.json()),
      fetch('/api/late/accounts').then((r) => r.json()),
      fetch('/api/late/profiles').then((r) => r.json()),
    ]).then(([videosData, accountsData, profilesData]) => {
      setVideos(videosData.videos || []);
      setAccounts(accountsData.accounts || []);
      setProfiles(profilesData.profiles || []);
    }).catch(console.error).finally(() => {
      setIsLoadingModal(false);
    });
    setPostForm({ caption: '', videoUrl: preselectedVideoUrl || '', date: '', time: '' });
    setUploadedVideoPath(null);
    setUploadedVideoPreviewUrl(null);
    setUploadedVideoName(null);
    setPublishMode('now');
    setSelectedProfiles([]);
    setSelectedAccountIds([]);
    setProfileSearchQuery('');
    setProfileMultiDropdownOpen(false);
    setPostTimezone('Asia/Kolkata');
    setForceRepost(false);
    setIsPosting(false);
    submitGuardRef.current = false;
  }, [open, preselectedVideoUrl]);

  const uploadPostVideoFile = async (file: File) => {
    setIsUploadingVideo(true);
    setUploadedVideoName(file.name);
    setPostVideoUploadProgress(0);
    try {
      const data = await uploadVideoDirectToGcs(file, {
        onProgress: (uploadedBytes, totalBytes) => {
          const progress = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100);
          setPostVideoUploadProgress(progress);
        },
      });
      if (data.success) {
        setUploadedVideoPath(data.gcsUrl);
        setUploadedVideoPreviewUrl(data.url || data.gcsUrl);
        setPostForm((p) => ({ ...p, videoUrl: '' }));
        showToast('Video uploaded successfully!', 'success');
      } else {
        setUploadedVideoName(null);
        showToast('Upload failed', 'error');
      }
    } catch (err) {
      setUploadedVideoName(null);
      showToast((err as Error).message || 'Upload failed', 'error');
    } finally {
      setIsUploadingVideo(false);
      setPostVideoUploadProgress(0);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPostVideoFile(file);
    e.target.value = '';
  };

  const submitPost = async () => {
    const videoUrl = uploadedVideoPath || postForm.videoUrl;
    if (!videoUrl) {
      showToast('Please select or upload a video', 'error');
      return;
    }
    if (selectedAccountIds.length === 0) {
      showToast('Please select at least one account', 'error');
      return;
    }
    if (publishMode === 'schedule' && (!postForm.date || !postForm.time)) {
      showToast('Please select both date and time for scheduling', 'error');
      return;
    }

    if (submitGuardRef.current || isPosting) return;

    const scheduledFor = publishMode === 'schedule'
      ? `${postForm.date}T${postForm.time}:00`
      : undefined;
    const dedupeKey = createPostSubmitFingerprint({
      videoUrl,
      caption: postForm.caption,
      publishMode,
      selectedAccountIds,
      scheduledFor,
      timezone: publishMode === 'schedule' ? postTimezone : undefined,
      forceRepost,
    });
    const shouldUseClientDedupe = !forceRepost;

    if (shouldUseClientDedupe && hasRecentSubmitFingerprint(dedupeKey)) {
      showToast('An identical post request was already submitted recently. Please wait a few seconds.', 'error');
      return;
    }

    if (shouldUseClientDedupe) {
      markSubmitFingerprint(dedupeKey);
    }
    submitGuardRef.current = true;
    setIsPosting(true);
    try {
      const platformTargets = selectedAccountIds.map((accId) => {
        const acc = postableAccounts.find((a) => a._id === accId);
        return { platform: acc?.platform || 'tiktok', accountId: accId };
      });

      const body: Record<string, unknown> = {
        videoUrl,
        caption: postForm.caption,
        platforms: platformTargets,
        publishMode,
        forceRepost,
      };
      if (shouldUseClientDedupe) {
        body.dedupeKey = dedupeKey;
      }
      if (forceRepost) {
        body.forceToken = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      }
      if (scheduledFor) {
        body.scheduledFor = scheduledFor;
        body.timezone = postTimezone;
      }

      // Store new post info so PostList shows a placeholder instantly
      try {
        sessionStorage.setItem('ai-ugc-new-post', JSON.stringify({
          caption: postForm.caption,
          platforms: platformTargets.map((t) => t.platform),
          publishMode,
        }));
      } catch {}

      onClose();
      const toastMsg = publishMode === 'now'
        ? `Publishing to ${platformTargets.length} account${platformTargets.length > 1 ? 's' : ''}...`
        : publishMode === 'schedule'
          ? 'Scheduling post...'
          : publishMode === 'draft'
            ? 'Saving draft...'
            : 'Adding to queue...';
      showToast(toastMsg, 'success');

      const res = await fetch('/api/posts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (res.ok && data.success) {
        showToast(data.message || 'Post submitted!', 'success');
        onSubmitted();
      } else {
        const errorMsg = data.error || 'Failed to post';
        const details = data.details;
        const detailMsg = details && typeof details === 'object'
          ? (details.error || details.message || '')
          : '';
        showToast(detailMsg || errorMsg, 'error');
        console.error('[Submit Post] Error:', JSON.stringify(data, null, 2));
        try { sessionStorage.removeItem('ai-ugc-new-post'); } catch {}
        if (shouldUseClientDedupe) {
          clearSubmitFingerprint(dedupeKey);
        }
      }
    } catch (err) {
      showToast('Error: ' + (err as Error).message, 'error');
      console.error('[Submit Post] Exception:', err);
      try { sessionStorage.removeItem('ai-ugc-new-post'); } catch {}
      if (shouldUseClientDedupe) {
        clearSubmitFingerprint(dedupeKey);
      }
    } finally {
      submitGuardRef.current = false;
      setIsPosting(false);
    }
  };

  if (!open) return null;

  const hasVideo = !!(uploadedVideoPath || postForm.videoUrl);
  const previewVideoSrc = uploadedVideoPath
    ? (uploadedVideoPreviewUrl || uploadedVideoPath)
    : postForm.videoUrl
      ? (videos.find((v) => v.path === postForm.videoUrl)?.url || postForm.videoUrl)
      : null;

  const submitLabel = (() => {
    if (forceRepost) {
      if (publishMode === 'draft') return 'Force Save Draft';
      if (publishMode === 'schedule') return 'Force Schedule Post';
      if (publishMode === 'queue') return 'Force Add to Queue';
      if (selectedAccountIds.length === 0) return 'Select accounts to force repost';
      return `Force Repost to ${selectedAccountIds.length} account${selectedAccountIds.length > 1 ? 's' : ''}`;
    }
    if (publishMode === 'draft') return 'Save Draft';
    if (publishMode === 'schedule') return 'Schedule Post';
    if (publishMode === 'queue') return 'Add to Queue';
    if (selectedAccountIds.length === 0) return 'Select accounts to publish';
    const selectedPlatforms = selectedAccountIds.map((id) => postableAccounts.find((a) => a._id === id)?.platform).filter(Boolean);
    const uniquePlatforms = [...new Set(selectedPlatforms)];
    if (selectedAccountIds.length === 1 && uniquePlatforms.length === 1) {
      const name = uniquePlatforms[0] === 'tiktok' ? 'TikTok' : uniquePlatforms[0] === 'youtube' ? 'YouTube' : 'Instagram';
      return `Publish to ${name}`;
    }
    return `Publish to ${selectedAccountIds.length} accounts`;
  })();

  return (
    <CreatePostModalContent
      onClose={onClose}
      isLoadingModal={isLoadingModal}
      hasVideo={hasVideo}
      previewVideoSrc={previewVideoSrc}
      uploadedVideoPath={uploadedVideoPath}
      uploadedVideoName={uploadedVideoName}
      videos={videos}
      profiles={profiles}
      accounts={accounts}
      postForm={postForm}
      publishMode={publishMode}
      selectedProfiles={selectedProfiles}
      selectedAccountIds={selectedAccountIds}
      profileSearchQuery={profileSearchQuery}
      profileMultiDropdownOpen={profileMultiDropdownOpen}
      postTimezone={postTimezone}
      forceRepost={forceRepost}
      postableAccounts={postableAccounts}
      isPosting={isPosting}
      isUploadingVideo={isUploadingVideo}
      postVideoUploadProgress={postVideoUploadProgress}
      submitLabel={submitLabel}
      setUploadedVideoPath={setUploadedVideoPath}
      setUploadedVideoPreviewUrl={setUploadedVideoPreviewUrl}
      setUploadedVideoName={setUploadedVideoName}
      setPostForm={setPostForm}
      setSelectedProfiles={setSelectedProfiles}
      setSelectedAccountIds={setSelectedAccountIds}
      setProfileSearchQuery={setProfileSearchQuery}
      setProfileMultiDropdownOpen={setProfileMultiDropdownOpen}
      setPublishMode={setPublishMode}
      setPostTimezone={setPostTimezone}
      setForceRepost={setForceRepost}
      handleVideoUpload={handleVideoUpload}
      uploadPostVideoFile={uploadPostVideoFile}
      submitPost={submitPost}
      showToast={showToast}
    />
  );
}
