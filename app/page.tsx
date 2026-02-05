'use client';

import { useState, useEffect, useCallback } from 'react';

type Job = {
  id: string;
  tiktokUrl?: string;
  videoUrl?: string;
  videoSource?: 'tiktok' | 'upload';
  imageUrl: string;
  imageName?: string; // Backwards compatibility
  status: string;
  step: string;
  outputUrl?: string;
  signedUrl?: string; // Signed URL for viewing video
  createdAt: string;
};

type Post = {
  _id: string;
  content?: string;
  scheduledFor?: string;
  createdAt?: string;
  mediaItems?: { url?: string; thumbnailUrl?: string }[];
  platforms?: { platform: string; status?: string; platformPostUrl?: string }[];
};

type Profile = {
  _id: string;
  name: string;
  description?: string;
  color?: string;
};

type Account = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  createdAt?: string;
  profileId?: { _id: string } | string;
};

type Model = {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  imageCount?: number;
  createdAt?: string;
};

type ModelImage = {
  id: string;
  modelId: string;
  gcsUrl: string;
  signedUrl?: string;
  filename: string;
  isPrimary?: boolean;
};

type Batch = {
  id: string;
  name: string;
  status: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  progress?: number;
  model?: { id: string; name: string; avatarUrl?: string };
  jobs?: Job[];
  createdAt?: string;
};

export default function Home() {
  const [page, setPage] = useState<'generate' | 'models' | 'batches' | 'posts' | 'connections'>('generate');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsFilter, setPostsFilter] = useState<string>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [uploadedVideoPath, setUploadedVideoPath] = useState<string | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [videoSource, setVideoSource] = useState<'tiktok' | 'upload'>('tiktok');
  const [uploadedSourceVideo, setUploadedSourceVideo] = useState<string | null>(null);
  const [uploadedSourceVideoName, setUploadedSourceVideoName] = useState<string | null>(null);
  const [isUploadingSourceVideo, setIsUploadingSourceVideo] = useState(false);
  const [maxSeconds, setMaxSeconds] = useState(10);
  const [generateDisabled, setGenerateDisabled] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [createPostModal, setCreatePostModal] = useState(false);
  const [newProfileModal, setNewProfileModal] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [videos, setVideos] = useState<{ name: string; path: string; url?: string }[]>([]);
  const [postForm, setPostForm] = useState({ caption: '', videoUrl: '', accountId: '', date: '', time: '' });
  const [isPosting, setIsPosting] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);
  const [newProfileForm, setNewProfileForm] = useState({ name: '', description: '', color: '#fcd34d' });
  const [editProfileForm, setEditProfileForm] = useState({ name: '', description: '', color: '#fcd34d' });
  const [preselectedVideoPath, setPreselectedVideoPath] = useState<string | null>(null);

  // Models state
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [modelImages, setModelImages] = useState<ModelImage[]>([]);
  const [modelImagesUploading, setModelImagesUploading] = useState(false);
  const [newModelModal, setNewModelModal] = useState(false);
  const [newModelForm, setNewModelForm] = useState({ name: '', description: '' });
  const [modelDetailModal, setModelDetailModal] = useState(false);

  // Batches state
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchDetailModal, setBatchDetailModal] = useState(false);
  const [batchPollingInterval, setBatchPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [postsPollingInterval, setPostsPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Bulk generate state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  const [selectedModelForGenerate, setSelectedModelForGenerate] = useState<string>('');
  const [imageSelectionMode, setImageSelectionMode] = useState<'all' | 'specific'>('all');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState('');

  // Loading states for better UX
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isCreatingModel, setIsCreatingModel] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(false);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isSettingPrimary, setIsSettingPrimary] = useState<string | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState<string | null>(null);
  const [videoPreviewModal, setVideoPreviewModal] = useState<{ url: string; caption: string } | null>(null);

  const showToast = useCallback((message: string, type = '') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load jobs:', e);
    }
  }, []);

  const loadPosts = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoadingPage(true);
    try {
      let endpoint = '/api/late/posts?limit=50';
      if (postsFilter !== 'all') endpoint += `&status=${postsFilter}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (e) {
      console.error('Failed to load posts:', e);
    } finally {
      if (showLoader) setIsLoadingPage(false);
    }
  }, [postsFilter]);

  const loadConnections = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoadingPage(true);
    try {
      const [profilesRes, accountsRes] = await Promise.all([
        fetch('/api/late/profiles'),
        fetch('/api/late/accounts'),
      ]);
      const profilesData = await profilesRes.json();
      const accountsData = await accountsRes.json();
      setProfiles(profilesData.profiles || []);
      setAccounts(accountsData.accounts || []);
      if (profilesData.profiles?.length && !currentProfile) {
        setCurrentProfile(profilesData.profiles[0]);
      }
    } catch (e) {
      console.error('Failed to load connections:', e);
    } finally {
      if (showLoader) setIsLoadingPage(false);
    }
  }, [currentProfile]);

  const loadModels = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoadingPage(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load models:', e);
    } finally {
      if (showLoader) setIsLoadingPage(false);
    }
  }, []);

  const loadModelImages = useCallback(async (modelId: string) => {
    try {
      const res = await fetch(`/api/models/${modelId}/images`);
      const data = await res.json();
      setModelImages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load model images:', e);
    }
  }, []);

  const loadBatches = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoadingPage(true);
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load batches:', e);
    } finally {
      if (showLoader) setIsLoadingPage(false);
    }
  }, []);

  const loadBatchDetail = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/batches/${batchId}`);
      const data = await res.json();
      setSelectedBatch(data);
    } catch (e) {
      console.error('Failed to load batch detail:', e);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (hasActive && !pollingInterval) {
      const id = setInterval(loadJobs, 2000);
      setPollingInterval(id);
    } else if (!hasActive && pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [jobs, loadJobs, pollingInterval]);

  useEffect(() => {
    const hasVideo = videoSource === 'tiktok' ? !!tiktokUrl.trim() : !!uploadedSourceVideo;
    setGenerateDisabled(!hasVideo || !uploadedImagePath);
  }, [tiktokUrl, uploadedImagePath, videoSource, uploadedSourceVideo]);

  useEffect(() => {
    if (page === 'posts') loadPosts(true);
  }, [page, postsFilter, loadPosts]);

  // Poll posts for status updates (publishing -> published)
  useEffect(() => {
    const hasPublishing = posts.some((p) => {
      const status = p.platforms?.[0]?.status || '';
      return status === 'publishing' || status === 'processing' || status === 'in_progress' || status === 'pending' || status === 'scheduled';
    });
    if (hasPublishing && page === 'posts' && !postsPollingInterval) {
      const id = setInterval(loadPosts, 5000);
      setPostsPollingInterval(id);
    } else if ((!hasPublishing || page !== 'posts') && postsPollingInterval) {
      clearInterval(postsPollingInterval);
      setPostsPollingInterval(null);
    }
    return () => {
      if (postsPollingInterval) clearInterval(postsPollingInterval);
    };
  }, [posts, page, postsPollingInterval, loadPosts]);

  useEffect(() => {
    if (page === 'connections') loadConnections(true);
  }, [page, loadConnections]);

  useEffect(() => {
    if (page === 'models') loadModels(true);
  }, [page, loadModels]);

  useEffect(() => {
    if (page === 'batches') loadBatches(true);
  }, [page, loadBatches]);

  useEffect(() => {
    if (page === 'generate') loadModels();
  }, [page, loadModels]);

  // Poll batches for progress updates
  useEffect(() => {
    const hasActive = batches.some((b) => b.status === 'pending' || b.status === 'processing');
    if (hasActive && page === 'batches' && !batchPollingInterval) {
      const id = setInterval(loadBatches, 3000);
      setBatchPollingInterval(id);
    } else if ((!hasActive || page !== 'batches') && batchPollingInterval) {
      clearInterval(batchPollingInterval);
      setBatchPollingInterval(null);
    }
    return () => {
      if (batchPollingInterval) clearInterval(batchPollingInterval);
    };
  }, [batches, page, loadBatches, batchPollingInterval]);

  // Parse bulk URLs
  const handleParseBulkUrls = async () => {
    if (!bulkUrls.trim()) {
      setParsedUrls([]);
      return;
    }
    try {
      const res = await fetch('/api/parse-tiktok-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bulkUrls }),
      });
      const data = await res.json();
      setParsedUrls(data.urls || []);
      if (data.duplicates > 0) {
        showToast(`Found ${data.urls.length} URLs (${data.duplicates} duplicates removed)`, 'success');
      }
    } catch (e) {
      console.error('Failed to parse URLs:', e);
    }
  };

  // Handle CSV upload for bulk URLs
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingCsv(true);
    const formData = new FormData();
    formData.append('csv', file);
    try {
      const res = await fetch('/api/parse-tiktok-urls', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setParsedUrls(data.urls || []);
      showToast(`Loaded ${data.urls.length} URLs from CSV`, 'success');
    } catch (e) {
      showToast('Failed to parse CSV', 'error');
    } finally {
      setIsParsingCsv(false);
    }
  };

  // Handle bulk generate
  const handleBulkGenerate = async () => {
    if (parsedUrls.length === 0) {
      showToast('No TikTok URLs to generate', 'error');
      return;
    }
    if (!selectedModelForGenerate && !uploadedImagePath) {
      showToast('Please select a model or upload an image', 'error');
      return;
    }

    setIsBulkGenerating(true);
    try {
      const body: Record<string, unknown> = {
        name: batchName || `Batch ${new Date().toLocaleString()}`,
        tiktokUrls: parsedUrls,
        maxSeconds,
      };

      if (selectedModelForGenerate) {
        if (imageSelectionMode === 'all') {
          body.modelId = selectedModelForGenerate;
        } else {
          body.imageIds = selectedImageIds;
        }
      } else {
        body.imageUrl = uploadedImagePath;
      }

      const res = await fetch('/api/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`Started batch with ${data.count} jobs!`, 'success');
        setBulkUrls('');
        setParsedUrls([]);
        setBatchName('');
        setPage('batches');
        loadBatches();
      } else {
        showToast(data.error || 'Failed to start batch', 'error');
      }
    } catch (e) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadedImageName(data.filename);
        setUploadedImagePath(data.url || data.path); // Use GCS URL
        showToast('Image uploaded', 'success');
      }
    } catch (err) {
      showToast('Upload failed', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSourceVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingSourceVideo(true);
    const formData = new FormData();
    formData.append('video', file);
    try {
      const res = await fetch('/api/upload-video', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.gcsUrl) {
        setUploadedSourceVideo(data.gcsUrl);
        setUploadedSourceVideoName(file.name);
        showToast('Video uploaded!', 'success');
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      showToast('Upload error', 'error');
    } finally {
      setIsUploadingSourceVideo(false);
      e.target.value = '';
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const payload: Record<string, unknown> = {
        imageUrl: uploadedImagePath,
        maxSeconds: maxSeconds,
      };

      if (videoSource === 'upload' && uploadedSourceVideo) {
        payload.videoUrl = uploadedSourceVideo;
      } else {
        payload.tiktokUrl = tiktokUrl.trim();
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setTiktokUrl('');
        setUploadedSourceVideo(null);
        setUploadedSourceVideoName(null);
        loadJobs();
        showToast('Generation started!', 'success');
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + (err as Error).message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const openCreatePostModal = async (withVideoUrl?: string) => {
    setIsLoadingModal(true);
    setCreatePostModal(true);
    try {
      // Load both videos and accounts in parallel
      const [videosRes, accountsRes] = await Promise.all([
        fetch('/api/videos'),
        fetch('/api/late/accounts'),
      ]);
      const videosData = await videosRes.json();
      const accountsData = await accountsRes.json();
      setVideos(videosData.videos || []);
      setAccounts(accountsData.accounts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingModal(false);
    }
    setPostForm((prev) => ({
      ...prev,
      caption: '',
      videoUrl: withVideoUrl ?? preselectedVideoPath ?? '',
      accountId: prev.accountId || '',
      date: prev.date || '',
      time: prev.time || '',
    }));
    setUploadedVideoPath(null);
    setPreselectedVideoPath(null);
    setUploadedVideoName(null);
    setPublishMode('now');
  };

  const submitPost = async () => {
    const videoUrl = uploadedVideoPath || postForm.videoUrl;
    if (!videoUrl) {
      showToast('Please select or upload a video', 'error');
      return;
    }
    if (!postForm.accountId) {
      showToast('Please select a TikTok account', 'error');
      return;
    }
    if (publishMode === 'schedule' && (!postForm.date || !postForm.time)) {
      showToast('Please select both date and time for scheduling', 'error');
      return;
    }

    setIsPosting(true);

    try {
      const body: Record<string, unknown> = {
        videoUrl,
        caption: postForm.caption,
        accountId: postForm.accountId,
        publishNow: publishMode === 'now',
      };
      if (publishMode === 'schedule') {
        body.scheduledFor = `${postForm.date}T${postForm.time}:00`;
        body.timezone = 'Asia/Kolkata';
        body.publishNow = false;
      }

      // Close modal immediately and show loading toast
      setCreatePostModal(false);
      showToast(publishMode === 'now' ? 'Publishing to TikTok...' : 'Scheduling post...', 'success');

      const res = await fetch('/api/tiktok/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const status = data.post?.status;
        if (status === 'published') {
          showToast(data.post?.platformPostUrl ? 'Published to TikTok!' : 'Video published!', 'success');
        } else if (status === 'scheduled') {
          showToast(data.message || 'Post scheduled successfully!', 'success');
        } else if (status === 'publishing') {
          showToast('Video is being published... Check posts page for status.', 'success');
        } else {
          showToast(data.message || 'Post submitted!', 'success');
        }
        loadPosts();
        setPage('posts');
      } else {
        const errorMsg = data.error || 'Failed to post';
        const details = data.details;
        showToast(details?.error || errorMsg, 'error');
        console.error('[Submit Post] Error:', data);
      }
    } catch (err) {
      showToast('Error: ' + (err as Error).message, 'error');
      console.error('[Submit Post] Exception:', err);
    } finally {
      setIsPosting(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVideo(true);
    setUploadedVideoName(file.name);

    const formData = new FormData();
    formData.append('video', file);
    try {
      const res = await fetch('/api/upload-video', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const videoUrl = data.url || data.path;
        setUploadedVideoPath(videoUrl);
        // Clear dropdown selection since we're using uploaded video
        setPostForm((p) => ({ ...p, videoUrl: '' }));
        showToast('Video uploaded successfully!', 'success');
      } else {
        setUploadedVideoName(null);
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      setUploadedVideoName(null);
      showToast('Upload failed', 'error');
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const profileAccounts = accounts.filter((a) => {
    const pId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
    return pId === currentProfile?._id;
  });

  const tiktokAccounts = accounts.filter((a) => a.platform === 'tiktok');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied!', 'success');
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--text)]">
      {/* Sidebar */}
      <nav className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-6 text-xl font-bold text-[var(--purple)]">AI UGC</div>
        <button
          onClick={() => setPage('generate')}
          className={`mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm transition-colors ${
            page === 'generate' ? 'bg-[var(--background)] font-medium text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
          }`}
        >
          <span className="text-lg">🎬</span> Generate
        </button>
        <button
          onClick={() => setPage('models')}
          className={`mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm transition-colors ${
            page === 'models' ? 'bg-[var(--background)] font-medium text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
          }`}
        >
          <span className="text-lg">👤</span> Models
        </button>
        <button
          onClick={() => setPage('batches')}
          className={`mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm transition-colors ${
            page === 'batches' ? 'bg-[var(--background)] font-medium text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
          }`}
        >
          <span className="text-lg">📦</span> Batches
        </button>
        <button
          onClick={() => setPage('posts')}
          className={`mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm transition-colors ${
            page === 'posts' ? 'bg-[var(--background)] font-medium text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
          }`}
        >
          <span className="text-lg">📋</span> Posts
        </button>
        <button
          onClick={() => setPage('connections')}
          className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm transition-colors ${
            page === 'connections' ? 'bg-[var(--background)] font-medium text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]'
          }`}
        >
          <span className="text-lg">🔗</span> Connections
        </button>
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">
        {page === 'generate' && (
          <div>
            <h1 className="mb-1 text-2xl font-bold">Generate Videos</h1>
            <p className="mb-6 text-[var(--text-muted)]">Create AI-powered UGC videos from TikTok content</p>

            {/* Mode Toggle */}
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setBulkMode(false)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${!bulkMode ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] hover:bg-[var(--background)]'}`}
              >
                Single Video
              </button>
              <button
                onClick={() => setBulkMode(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${bulkMode ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] hover:bg-[var(--background)]'}`}
              >
                Bulk Generate
              </button>
            </div>

            {!bulkMode ? (
              /* Single Video Mode */
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h3 className="mb-4 text-lg font-semibold">Create Video</h3>

                  {/* Video Source Toggle */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Video Source</label>
                    <div className="flex rounded-lg border border-[var(--border)] p-1">
                      <button
                        onClick={() => setVideoSource('tiktok')}
                        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                          videoSource === 'tiktok'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
                        }`}
                      >
                        TikTok URL
                      </button>
                      <button
                        onClick={() => setVideoSource('upload')}
                        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                          videoSource === 'upload'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
                        }`}
                      >
                        Upload Video
                      </button>
                    </div>
                  </div>

                  {/* TikTok URL Input */}
                  {videoSource === 'tiktok' ? (
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">TikTok URL</label>
                      <input
                        type="text"
                        value={tiktokUrl}
                        onChange={(e) => setTiktokUrl(e.target.value)}
                        placeholder="https://www.tiktok.com/@user/video/..."
                        className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    /* Video Upload */
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Upload Video</label>
                      <label className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-transparent py-8 transition-colors ${
                        isUploadingSourceVideo
                          ? 'cursor-wait border-[var(--primary)] bg-[var(--primary)]/5'
                          : 'cursor-pointer border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
                      }`}>
                        {isUploadingSourceVideo ? (
                          <>
                            <svg className="h-10 w-10 animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="mt-2 text-sm font-medium text-[var(--primary)]">Uploading...</span>
                          </>
                        ) : uploadedSourceVideo ? (
                          <div className="flex flex-col items-center">
                            <svg className="h-10 w-10 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="mt-2 text-sm font-medium text-[var(--text)]">{uploadedSourceVideoName}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setUploadedSourceVideo(null);
                                setUploadedSourceVideoName(null);
                              }}
                              className="mt-2 text-xs text-[var(--error)] hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <>
                            <svg className="h-10 w-10 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="mt-2 text-sm text-[var(--text-muted)]">Click or drag video here</span>
                            <span className="mt-1 text-xs text-[var(--text-muted)]">MP4, MOV, WebM</span>
                          </>
                        )}
                        <input type="file" accept="video/mp4,video/mov,video/webm,.mp4,.mov,.webm" className="hidden" onChange={handleSourceVideoUpload} disabled={isUploadingSourceVideo} />
                      </label>
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Model Image</label>
                    <label className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-transparent py-8 transition-colors ${
                      isUploadingImage
                        ? 'cursor-wait border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'cursor-pointer border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
                    }`}>
                      {isUploadingImage ? (
                        <>
                          <svg className="h-10 w-10 animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="mt-2 text-sm font-medium text-[var(--primary)]">Uploading...</span>
                        </>
                      ) : uploadedImagePath ? (
                        <img src={uploadedImagePath} alt="Uploaded" className="max-h-36 max-w-full rounded-lg object-contain" />
                      ) : (
                        <span className="text-3xl">+</span>
                      )}
                      {!isUploadingImage && <span className="mt-2 text-sm text-[var(--text-muted)]">Click or drag image here</span>}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploadingImage} />
                    </label>
                  </div>
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
                      Max Duration: <span>{maxSeconds}</span>s
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      value={maxSeconds}
                      onChange={(e) => setMaxSeconds(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generateDisabled || isGenerating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Starting Generation...
                      </>
                    ) : (
                      'Generate Video'
                    )}
                  </button>
                </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h3 className="mb-4 text-lg font-semibold">Generation Queue</h3>
                {jobs.length === 0 ? (
                  <p className="text-[var(--text-muted)]">No videos generated yet</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.slice(0, 10).map((job) => (
                      <div key={job.id} className="rounded-lg bg-[var(--background)] p-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
                          <span className="truncate">
                            {job.videoSource === 'upload'
                              ? '📁 Uploaded video'
                              : job.tiktokUrl?.slice(0, 40) + '...'}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              job.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                              job.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                              'bg-[var(--warning-bg)] text-[var(--warning)]'
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{job.step}</div>
                        {job.status === 'completed' && (job.signedUrl || job.outputUrl) && (
                          <div className="mt-2 flex gap-2">
                            <a
                              href={job.signedUrl || job.outputUrl}
                              download
                              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--background)]"
                            >
                              Download
                            </a>
                            <button
                              onClick={() => {
                                // Use outputUrl (GCS path) for backend upload, not signed URL
                                setPreselectedVideoPath(job.outputUrl!);
                                setPage('posts');
                                setTimeout(() => openCreatePostModal(job.outputUrl!), 100);
                              }}
                              className="rounded border border-[var(--accent-border)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium hover:bg-[#fde68a]"
                            >
                              Post to TikTok
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            ) : (
              /* Bulk Mode */
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  {/* Bulk URL Input */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                    <h3 className="mb-4 text-lg font-semibold">TikTok URLs</h3>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
                        Paste TikTok URLs (one per line or comma-separated)
                      </label>
                      <textarea
                        value={bulkUrls}
                        onChange={(e) => setBulkUrls(e.target.value)}
                        onBlur={handleParseBulkUrls}
                        placeholder="https://www.tiktok.com/@user/video/123...&#10;https://vm.tiktok.com/abc..."
                        className="min-h-[150px] w-full resize-y rounded-lg border border-[var(--border)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm ${
                        isParsingCsv ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-[var(--background)]'
                      }`}>
                        {isParsingCsv ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Parsing...
                          </>
                        ) : (
                          'Upload CSV'
                        )}
                        <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={isParsingCsv} />
                      </label>
                      <span className="text-sm text-[var(--text-muted)]">
                        {parsedUrls.length > 0 ? `${parsedUrls.length} URLs ready` : 'No URLs parsed'}
                      </span>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                    <h3 className="mb-4 text-lg font-semibold">Model Selection</h3>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Select Model</label>
                      <select
                        value={selectedModelForGenerate}
                        onChange={(e) => {
                          setSelectedModelForGenerate(e.target.value);
                          if (e.target.value) {
                            loadModelImages(e.target.value);
                          } else {
                            setModelImages([]);
                          }
                        }}
                        className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
                      >
                        <option value="">Select a model...</option>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.imageCount || 0} images)</option>
                        ))}
                      </select>
                    </div>

                    {selectedModelForGenerate && (
                      <>
                        <div className="mb-4 flex gap-2">
                          <button
                            onClick={() => setImageSelectionMode('all')}
                            className={`rounded-lg px-3 py-2 text-sm ${imageSelectionMode === 'all' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                          >
                            Use All (Random)
                          </button>
                          <button
                            onClick={() => setImageSelectionMode('specific')}
                            className={`rounded-lg px-3 py-2 text-sm ${imageSelectionMode === 'specific' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                          >
                            Select Specific
                          </button>
                        </div>

                        {imageSelectionMode === 'specific' && modelImages.length > 0 && (
                          <div className="grid grid-cols-4 gap-2">
                            {modelImages.map((img) => (
                              <label key={img.id} className="relative cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedImageIds.includes(img.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedImageIds((prev) => [...prev, img.id]);
                                    } else {
                                      setSelectedImageIds((prev) => prev.filter((id) => id !== img.id));
                                    }
                                  }}
                                  className="absolute left-2 top-2 z-10"
                                />
                                <img
                                  src={img.signedUrl || img.gcsUrl}
                                  alt=""
                                  className={`h-20 w-full rounded-lg object-cover ${selectedImageIds.includes(img.id) ? 'ring-2 ring-[var(--primary)]' : ''}`}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {!selectedModelForGenerate && (
                      <div className="text-center text-sm text-[var(--text-muted)]">
                        <p className="mb-2">Or upload a single image:</p>
                        <label className="cursor-pointer rounded-lg border-2 border-dashed border-[var(--border)] p-4 hover:bg-[var(--background)] inline-block">
                          {uploadedImagePath ? (
                            <img src={uploadedImagePath} alt="" className="h-20 w-20 rounded-lg object-cover" />
                          ) : (
                            <span>+ Upload</span>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Generate Settings & Preview */}
                <div className="space-y-6">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                    <h3 className="mb-4 text-lg font-semibold">Generation Settings</h3>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Batch Name (optional)</label>
                      <input
                        type="text"
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        placeholder="My Batch"
                        className="w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
                        Max Duration: <span>{maxSeconds}</span>s
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={30}
                        value={maxSeconds}
                        onChange={(e) => setMaxSeconds(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div className="mb-4 rounded-lg bg-[var(--background)] p-4">
                      <h4 className="mb-2 font-medium">Summary</h4>
                      <ul className="space-y-1 text-sm text-[var(--text-muted)]">
                        <li>Videos: {parsedUrls.length}</li>
                        <li>Model: {selectedModelForGenerate ? models.find((m) => m.id === selectedModelForGenerate)?.name : 'Single image'}</li>
                        <li>Images: {imageSelectionMode === 'all' ? modelImages.length || 1 : selectedImageIds.length || 1}</li>
                        <li>Duration: {maxSeconds}s max</li>
                      </ul>
                    </div>

                    <button
                      onClick={handleBulkGenerate}
                      disabled={parsedUrls.length === 0 || (!selectedModelForGenerate && !uploadedImagePath) || isBulkGenerating}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isBulkGenerating ? (
                        <>
                          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Starting Batch...
                        </>
                      ) : (
                        `Generate ${parsedUrls.length} Videos`
                      )}
                    </button>
                  </div>

                  {/* Recent Batches */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Recent Batches</h3>
                      <button onClick={() => setPage('batches')} className="text-sm text-[var(--primary)]">View all</button>
                    </div>
                    {batches.slice(0, 3).map((batch) => (
                      <div key={batch.id} className="mb-2 rounded-lg bg-[var(--background)] p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{batch.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            batch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                            batch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                            'bg-[var(--warning-bg)] text-[var(--warning)]'
                          }`}>
                            {batch.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {batch.completedJobs}/{batch.totalJobs} completed
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--border)]">
                          <div
                            className="h-full rounded-full bg-[var(--primary)]"
                            style={{ width: `${batch.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Models Tab */}
        {page === 'models' && (
          <div>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">Models</h1>
                <p className="text-[var(--text-muted)]">Manage personas with multiple reference images</p>
              </div>
              <button
                onClick={() => setNewModelModal(true)}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                + New Model
              </button>
            </div>

            {isLoadingPage ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-[var(--background)]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 rounded bg-[var(--background)]" />
                        <div className="h-3 w-16 rounded bg-[var(--background)]" />
                      </div>
                    </div>
                    <div className="h-3 w-full rounded bg-[var(--background)]" />
                  </div>
                ))}
              </div>
            ) : models.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
                <h3 className="mb-2 font-semibold">No models yet</h3>
                <p className="mb-4 text-[var(--text-muted)]">Create a model to upload reference images</p>
                <button
                  onClick={() => setNewModelModal(true)}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white"
                >
                  + Create Model
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {models.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model);
                      loadModelImages(model.id);
                      setModelDetailModal(true);
                    }}
                    className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-shadow hover:shadow-lg"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      {model.avatarUrl ? (
                        <img src={model.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--background)] text-2xl">👤</div>
                      )}
                      <div>
                        <div className="font-semibold">{model.name}</div>
                        <div className="text-sm text-[var(--text-muted)]">{model.imageCount || 0} images</div>
                      </div>
                    </div>
                    {model.description && (
                      <p className="text-sm text-[var(--text-muted)]">{model.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Batches Tab */}
        {page === 'batches' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Batches</h1>
              <p className="text-[var(--text-muted)]">Track bulk video generation progress</p>
            </div>

            {isLoadingPage ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[var(--background)]" />
                        <div className="space-y-2">
                          <div className="h-4 w-32 rounded bg-[var(--background)]" />
                          <div className="h-3 w-24 rounded bg-[var(--background)]" />
                        </div>
                      </div>
                      <div className="h-6 w-20 rounded-full bg-[var(--background)]" />
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between">
                        <div className="h-3 w-32 rounded bg-[var(--background)]" />
                        <div className="h-3 w-8 rounded bg-[var(--background)]" />
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--background)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : batches.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
                <h3 className="mb-2 font-semibold">No batches yet</h3>
                <p className="mb-4 text-[var(--text-muted)]">Start a bulk generation to create a batch</p>
                <button
                  onClick={() => { setBulkMode(true); setPage('generate'); }}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white"
                >
                  Start Bulk Generate
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    onClick={() => {
                      loadBatchDetail(batch.id);
                      setBatchDetailModal(true);
                    }}
                    className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-shadow hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {batch.model?.avatarUrl && (
                          <img src={batch.model.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                        )}
                        <div>
                          <div className="font-semibold">{batch.name}</div>
                          <div className="text-sm text-[var(--text-muted)]">
                            {batch.model?.name || 'Single image'} · {batch.totalJobs} videos
                          </div>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                        batch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                        batch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                        batch.status === 'partial' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                        'bg-[var(--background)] text-[var(--text-muted)]'
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-sm text-[var(--text-muted)]">
                        <span>{batch.completedJobs} completed, {batch.failedJobs} failed</span>
                        <span>{batch.progress || 0}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--background)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all"
                          style={{ width: `${batch.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {page === 'posts' && (
          <div>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">Posts</h1>
                <p className="text-[var(--text-muted)]">Manage scheduled and published content</p>
              </div>
              <button
                onClick={() => openCreatePostModal()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                + Create Post
              </button>
            </div>
            <div className="mb-4 flex gap-2">
              {['all', 'published', 'scheduled', 'draft', 'failed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setPostsFilter(f)}
                  className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                    postsFilter === f
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--background)]'
                  }`}
                >
                  {f === 'all' ? 'All posts' : f}
                </button>
              ))}
            </div>
            {isLoadingPage ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex animate-pulse items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="h-48 w-36 shrink-0 rounded-xl bg-[var(--background)]" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="h-5 w-3/4 rounded bg-[var(--background)]" />
                      <div className="h-4 w-1/2 rounded bg-[var(--background)]" />
                      <div className="h-4 w-1/3 rounded bg-[var(--background)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-muted)]">
                <h3 className="mb-2 font-semibold text-[var(--text)]">No posts yet</h3>
                <p className="mb-4">Create your first post to get started</p>
                <button onClick={() => openCreatePostModal()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white hover:bg-[var(--primary-hover)]">
                  + Create Post
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => {
                  const platform = post.platforms?.[0];
                  const status = platform?.status || (post as { status?: string }).status || 'draft';
                  const thumbnail = post.mediaItems?.[0]?.url || post.mediaItems?.[0]?.thumbnailUrl;
                  const isVideo = thumbnail?.includes('.mp4') || thumbnail?.includes('video') || post.mediaItems?.[0]?.thumbnailUrl;
                  return (
                    <div key={post._id} className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      {/* Checkbox */}
                      <input type="checkbox" className="mt-2 h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--primary)]" />

                      {/* Thumbnail */}
                      <div
                        className={`relative h-48 w-36 shrink-0 overflow-hidden rounded-xl bg-[var(--background)] ${thumbnail ? 'cursor-pointer group' : ''}`}
                        onClick={() => {
                          if (thumbnail) {
                            setVideoPreviewModal({ url: thumbnail, caption: post.content || '(No caption)' });
                          }
                        }}
                      >
                        {thumbnail ? (
                          <>
                            <video
                              src={thumbnail}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(e) => {
                                // Seek to first frame to show thumbnail
                                const video = e.currentTarget;
                                video.currentTime = 0.1;
                              }}
                            />
                            {/* Play button overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                                <svg className="h-6 w-6 text-[var(--primary)] ml-1" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                            {/* Video indicator */}
                            <div className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
                              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-start justify-between gap-4">
                          <h3 className="text-lg font-semibold text-[var(--text)]">{post.content || '(No caption)'}</h3>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                              status === 'published' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                              status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                              status === 'partial' ? 'bg-orange-100 text-orange-600 border border-orange-200' :
                              status === 'scheduled' ? 'bg-blue-100 text-blue-600 border border-blue-200' :
                              (status === 'publishing' || status === 'processing' || status === 'in_progress' || status === 'pending') ? 'bg-amber-100 text-amber-600' :
                              'bg-[var(--background)] text-[var(--text-muted)]'
                            }`}
                          >
                            {status === 'published' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                            {(status === 'publishing' || status === 'processing' || status === 'in_progress' || status === 'pending') && <span className="text-base">🚀</span>}
                            {status === 'scheduled' && <span className="text-base">⏰</span>}
                            {status === 'partial' && <span className="text-base">⚠️</span>}
                            {(status === 'publishing' || status === 'processing' || status === 'in_progress' || status === 'pending') ? 'Publishing' : status === 'partial' ? 'Partial' : status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                        </div>

                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
                          {post.scheduledFor && (
                            <span>scheduled: {new Date(post.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(post.scheduledFor).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
                          )}
                          {post.createdAt && <span>created: {new Date(post.createdAt).toLocaleDateString()}</span>}
                          <span>• by: Internal •</span>
                        </div>

                        {/* Post ID */}
                        <div className="mb-3 flex items-center gap-2 text-sm">
                          <span className="text-[var(--text-muted)]">id:</span>
                          <span className="font-mono text-[var(--text)]">{post._id.slice(0, 9)}...</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(post._id);
                              showToast('ID copied!', 'success');
                            }}
                            className="rounded p-1 hover:bg-[var(--background)]"
                            title="Copy ID"
                          >
                            <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>

                        {/* Platforms */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--text-muted)]">platforms:</span>
                          <div className="flex flex-wrap gap-2">
                            {post.platforms?.map((p) => {
                              const pStatus = p.status || 'pending';
                              const isPublishing = pStatus === 'publishing' || pStatus === 'processing' || pStatus === 'in_progress' || pStatus === 'pending';
                              const isScheduled = pStatus === 'scheduled';
                              const isPartial = pStatus === 'partial';
                              return (
                                <span
                                  key={p.platform}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                                    pStatus === 'published' ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]' :
                                    pStatus === 'failed' ? 'border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)]' :
                                    isScheduled ? 'border-amber-300 bg-amber-50 text-amber-700' :
                                    isPublishing ? 'border-amber-300 bg-amber-50 text-amber-600' :
                                    'border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]'
                                  }`}
                                >
                                  {p.platform === 'tiktok' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>}
                                  {p.platform === 'instagram' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>}
                                  {p.platform === 'youtube' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>}
                                  {p.platform === 'twitter' && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                                  {p.platform}
                                  {pStatus === 'published' && <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                  {isScheduled && (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                  {isPublishing && !isScheduled && (
                                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  )}
                                  {pStatus === 'published' && p.platformPostUrl && (
                                    <a href={p.platformPostUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
                                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 flex-col gap-2 self-end">
                        {(status === 'failed' || status === 'partial') && (
                          <button
                            onClick={async () => {
                              setIsRetrying(post._id);
                              try {
                                await fetch(`/api/late/posts/${post._id}/retry`, { method: 'POST' });
                                showToast('Retrying publish...', 'success');
                                loadPosts();
                              } finally {
                                setIsRetrying(null);
                              }
                            }}
                            disabled={isRetrying === post._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2 text-sm font-medium text-[var(--success)] hover:opacity-80 disabled:opacity-50"
                          >
                            {isRetrying === post._id ? (
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                            {isRetrying === post._id ? 'retrying...' : 'retry'}
                          </button>
                        )}
                        {status === 'scheduled' && (
                          <button
                            onClick={() => {
                              // TODO: Open edit modal for scheduled post
                              showToast('Edit feature coming soon', 'success');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:opacity-80"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            edit
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this post?')) return;
                            setIsDeletingPost(post._id);
                            try {
                              await fetch(`/api/late/posts/${post._id}`, { method: 'DELETE' });
                              showToast('Post deleted', 'success');
                              loadPosts();
                            } finally {
                              setIsDeletingPost(null);
                            }
                          }}
                          disabled={isDeletingPost === post._id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--error)] bg-[var(--error-bg)] px-3 py-2 text-sm font-medium text-[var(--error)] hover:opacity-80 disabled:opacity-50"
                        >
                          {isDeletingPost === post._id ? (
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                          {isDeletingPost === post._id ? 'deleting...' : 'delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {page === 'connections' && (
          <div>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">Connections</h1>
                <p className="text-[var(--text-muted)]">Manage profiles and platform integrations</p>
              </div>
              <button
                onClick={() => setNewProfileModal(true)}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                + New Profile
              </button>
            </div>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="font-semibold">Select Profile</h3>
              <button
                onClick={() => {
                  if (currentProfile) {
                    setEditProfileForm({
                      name: currentProfile.name,
                      description: currentProfile.description || '',
                      color: currentProfile.color || '#fcd34d',
                    });
                    setEditProfileModal(true);
                  }
                }}
                className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--background)]"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!currentProfile) return;
                  const profileAccounts = accounts.filter((a) => {
                    const pId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
                    return pId === currentProfile._id;
                  });
                  if (profileAccounts.length > 0) {
                    showToast('Disconnect all accounts before deleting profile', 'error');
                    return;
                  }
                  if (!confirm(`Delete "${currentProfile.name}"?`)) return;
                  await fetch(`/api/late/profiles/${currentProfile._id}`, { method: 'DELETE' });
                  showToast('Profile deleted', 'success');
                  setCurrentProfile(null);
                  loadConnections();
                }}
                className="rounded border border-[var(--error)] bg-[var(--error-bg)] px-2 py-1 text-sm text-[var(--error)]"
              >
                Delete
              </button>
            </div>
            <div className="relative mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <button
                onClick={() => setProfileDropdownOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: currentProfile?.color || '#fcd34d' }}
                  />
                  <div className="text-left">
                    <div className="font-medium">{currentProfile?.name ?? 'Loading...'}</div>
                    <div className="text-sm text-[var(--text-muted)]">{currentProfile?.description ?? '-'}</div>
                  </div>
                </div>
                <span>▼</span>
              </button>
              {profileDropdownOpen && (
                <div className="absolute left-4 right-4 top-full z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                  {profiles.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => {
                        setCurrentProfile(p);
                        setProfileDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--background)]"
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color || '#fcd34d' }} />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{p.description || ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                profile id: <span>{currentProfile?._id ?? '-'}</span>
                <button
                  onClick={() => currentProfile && copyToClipboard(currentProfile._id)}
                  className="rounded border border-[var(--border)] px-2 py-0.5 hover:bg-[var(--background)]"
                >
                  copy
                </button>
              </div>
            </div>
            <h3 className="mb-4 font-semibold">Platforms</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {['tiktok', 'instagram', 'youtube', 'facebook', 'twitter', 'linkedin'].map((platform) => {
                const account = profileAccounts.find((a) => a.platform === platform);
                const icon = platform === 'tiktok' ? '♪' : platform === 'instagram' ? '📷' : platform === 'youtube' ? '▶' : platform === 'facebook' ? 'f' : platform === 'linkedin' ? 'in' : '𝕏';
                return (
                  <div key={platform} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-[var(--tiktok)]">{icon}</span>
                      <span className="font-semibold capitalize">{platform === 'twitter' ? 'X (Twitter)' : platform}</span>
                    </div>
                    {account ? (
                      <>
                        <div className="mb-2 rounded-lg bg-[var(--background)] p-3">
                          <div className="flex items-center gap-3">
                            {account.profilePicture ? (
                              <img
                                src={account.profilePicture}
                                alt={account.username || account.displayName || 'Profile'}
                                className="h-12 w-12 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-lg font-semibold text-[var(--text-muted)]">
                                {(account.username || account.displayName || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">@{account.username || account.displayName}</div>
                              {account.createdAt && (
                                <div className="text-xs text-[var(--text-muted)]">Connected {new Date(account.createdAt).toLocaleDateString()}</div>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            id: {account._id.slice(0, 8)}...
                            <button onClick={() => copyToClipboard(account._id)} className="rounded border px-1 hover:bg-white">copy</button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              if (!confirm('Disconnect this account?')) return;
                              setIsDisconnecting(account._id);
                              try {
                                await fetch(`/api/late/accounts/${account._id}`, { method: 'DELETE' });
                                showToast('Disconnected', 'success');
                                loadConnections();
                              } finally {
                                setIsDisconnecting(null);
                              }
                            }}
                            disabled={isDisconnecting === account._id}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] py-2 text-sm hover:bg-[var(--background)] disabled:opacity-50"
                          >
                            {isDisconnecting === account._id ? (
                              <>
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Disconnecting...
                              </>
                            ) : (
                              'Disconnect'
                            )}
                          </button>
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/late/invite/${platform}?profileId=${currentProfile!._id}`);
                              const data = await res.json();
                              if (data.inviteUrl) {
                                copyToClipboard(data.inviteUrl);
                                showToast('Invite link copied!', 'success');
                              }
                            }}
                            className="w-full rounded-lg border border-[var(--border)] py-2 text-sm hover:bg-[var(--background)]"
                          >
                            🔗 Invite
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={async () => {
                            setIsConnecting(platform);
                            try {
                              const res = await fetch(`/api/late/connect/${platform}?profileId=${currentProfile!._id}`);
                              const data = await res.json();
                              if (data.connectUrl) {
                                window.open(data.connectUrl, '_blank');
                                showToast('Complete authorization in the new window, then refresh', 'success');
                              }
                            } finally {
                              setIsConnecting(null);
                            }
                          }}
                          disabled={isConnecting === platform}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent)] py-2 text-sm hover:bg-[#fde68a] disabled:opacity-50"
                        >
                          {isConnecting === platform ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Connecting...
                            </>
                          ) : (
                            '+ Connect'
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/late/invite/${platform}?profileId=${currentProfile!._id}`);
                            const data = await res.json();
                            if (data.inviteUrl) {
                              copyToClipboard(data.inviteUrl);
                              showToast('Invite link copied!', 'success');
                            }
                          }}
                          className="w-full rounded-lg border border-[var(--border)] py-2 text-sm hover:bg-[var(--background)]"
                        >
                          🔗 Invite
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Create Post Modal */}
      {createPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreatePostModal(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold">Create Post</h3>
              <button onClick={() => setCreatePostModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
            {isLoadingModal ? (
              <div className="space-y-4 p-4">
                <div className="animate-pulse space-y-4">
                  <div>
                    <div className="mb-2 h-4 w-24 rounded bg-[var(--background)]" />
                    <div className="h-10 w-full rounded-lg bg-[var(--background)]" />
                  </div>
                  <div>
                    <div className="mb-2 h-4 w-16 rounded bg-[var(--background)]" />
                    <div className="h-24 w-full rounded-lg bg-[var(--background)]" />
                  </div>
                  <div>
                    <div className="mb-2 h-4 w-32 rounded bg-[var(--background)]" />
                    <div className="h-10 w-full rounded-lg bg-[var(--background)]" />
                  </div>
                  <div className="h-12 w-full rounded-lg bg-[var(--background)]" />
                </div>
              </div>
            ) : (
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Select Video</label>

                {/* Uploaded Video Preview */}
                {uploadedVideoPath && (
                  <div className="mb-3 overflow-hidden rounded-xl border-2 border-[var(--success)] bg-[var(--success-bg)]">
                    <div className="flex items-center justify-between border-b border-[var(--success)]/20 bg-[var(--success-bg)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm font-medium text-[var(--success)]">Uploaded: {uploadedVideoName || 'video.mp4'}</span>
                      </div>
                      <button
                        onClick={() => {
                          setUploadedVideoPath(null);
                          setUploadedVideoName(null);
                        }}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--error)]"
                        title="Remove video"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="bg-black">
                      <video
                        src={uploadedVideoPath}
                        controls
                        className="mx-auto max-h-48 w-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* Dropdown for generated videos (only show if no uploaded video) */}
                {!uploadedVideoPath && (
                  <>
                    <select
                      value={postForm.videoUrl}
                      onChange={(e) => setPostForm((p) => ({ ...p, videoUrl: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                      disabled={isUploadingVideo}
                    >
                      <option value="">Select a generated video...</option>
                      {videos.map((v) => (
                        <option key={v.path} value={v.path}>{v.name}</option>
                      ))}
                    </select>

                    {/* Video Preview from dropdown */}
                    {postForm.videoUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-black">
                        <video
                          src={videos.find((v) => v.path === postForm.videoUrl)?.url || postForm.videoUrl}
                          controls
                          className="mx-auto max-h-48 w-full object-contain"
                        />
                      </div>
                    )}

                    <p className="mt-3 text-center text-sm text-[var(--text-muted)]">or</p>
                  </>
                )}

                {/* Upload area */}
                {!uploadedVideoPath && (
                  <label className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors ${
                    isUploadingVideo
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 cursor-wait'
                      : 'border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
                  }`}>
                    {isUploadingVideo ? (
                      <>
                        <svg className="h-8 w-8 animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="mt-2 text-sm font-medium text-[var(--primary)]">Uploading {uploadedVideoName}...</span>
                        <span className="text-xs text-[var(--text-muted)]">Please wait</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="mt-2 text-sm font-medium text-[var(--text)]">Upload video from computer</span>
                        <span className="text-xs text-[var(--text-muted)]">MP4, MOV, WebM supported</span>
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
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">Caption</label>
                <textarea
                  value={postForm.caption}
                  onChange={(e) => setPostForm((p) => ({ ...p, caption: e.target.value }))}
                  placeholder="Write your caption... #fyp #viral"
                  className="min-h-[100px] w-full resize-y rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">TikTok Account</label>
                <select
                  value={postForm.accountId}
                  onChange={(e) => setPostForm((p) => ({ ...p, accountId: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                >
                  <option value="">No TikTok accounts connected</option>
                  {tiktokAccounts.map((a) => (
                    <option key={a._id} value={a._id}>@{a.username || a.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">When to Post</label>
                <div className="mb-2 flex gap-2">
                  <button
                    onClick={() => setPublishMode('now')}
                    className={`rounded-lg px-4 py-2 ${publishMode === 'now' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                  >
                    Publish Now
                  </button>
                  <button
                    onClick={() => setPublishMode('schedule')}
                    className={`rounded-lg px-4 py-2 ${publishMode === 'schedule' ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)]'}`}
                  >
                    Schedule
                  </button>
                </div>
                {publishMode === 'schedule' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)]">Date</label>
                      <input
                        type="date"
                        value={postForm.date}
                        onChange={(e) => setPostForm((p) => ({ ...p, date: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-muted)]">Time</label>
                      <input
                        type="time"
                        value={postForm.time}
                        onChange={(e) => setPostForm((p) => ({ ...p, time: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                      />
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={submitPost}
                disabled={isPosting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPosting ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {publishMode === 'now' ? 'Publishing...' : 'Scheduling...'}
                  </>
                ) : (
                  publishMode === 'now' ? 'Upload to TikTok' : 'Schedule Post'
                )}
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* New Profile Modal */}
      {newProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNewProfileModal(false)}>
          <div className="w-full max-w-md overflow-auto rounded-2xl bg-[var(--surface)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create New Profile</h3>
              <button onClick={() => setNewProfileModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Profile Name</label>
                <input
                  type="text"
                  value={newProfileForm.name}
                  onChange={(e) => setNewProfileForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., TikTok Account 3"
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
                <input
                  type="text"
                  value={newProfileForm.description}
                  onChange={(e) => setNewProfileForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g., Main business account"
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Color</label>
                <input
                  type="color"
                  value={newProfileForm.color}
                  onChange={(e) => setNewProfileForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-[var(--border)]"
                />
              </div>
              <button
                onClick={async () => {
                  if (!newProfileForm.name.trim()) {
                    showToast('Profile name is required', 'error');
                    return;
                  }
                  setIsCreatingProfile(true);
                  try {
                    const res = await fetch('/api/late/profiles', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newProfileForm),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setNewProfileModal(false);
                      setNewProfileForm({ name: '', description: '', color: '#fcd34d' });
                      showToast('Profile created!', 'success');
                      loadConnections();
                    } else {
                      showToast(data.error || 'Failed', 'error');
                    }
                  } finally {
                    setIsCreatingProfile(false);
                  }
                }}
                disabled={isCreatingProfile}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {isCreatingProfile ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Profile'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editProfileModal && currentProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditProfileModal(false)}>
          <div className="w-full max-w-md overflow-auto rounded-2xl bg-[var(--surface)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Profile</h3>
              <button onClick={() => setEditProfileModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Profile Name</label>
                <input
                  type="text"
                  value={editProfileForm.name}
                  onChange={(e) => setEditProfileForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
                <input
                  type="text"
                  value={editProfileForm.description}
                  onChange={(e) => setEditProfileForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Color</label>
                <input
                  type="color"
                  value={editProfileForm.color}
                  onChange={(e) => setEditProfileForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-[var(--border)]"
                />
              </div>
              <button
                onClick={async () => {
                  if (!editProfileForm.name.trim()) {
                    showToast('Profile name is required', 'error');
                    return;
                  }
                  setIsSavingProfile(true);
                  try {
                    const res = await fetch(`/api/late/profiles/${currentProfile._id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(editProfileForm),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setEditProfileModal(false);
                      showToast('Profile updated!', 'success');
                      loadConnections();
                      const updated = (data.profile || data) as Profile;
                      if (updated._id === currentProfile._id) setCurrentProfile(updated);
                    } else {
                      showToast(data.error || 'Failed', 'error');
                    }
                  } finally {
                    setIsSavingProfile(false);
                  }
                }}
                disabled={isSavingProfile}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Model Modal */}
      {newModelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNewModelModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create New Model</h3>
              <button onClick={() => setNewModelModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Model Name</label>
                <input
                  type="text"
                  value={newModelForm.name}
                  onChange={(e) => setNewModelForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Sarah"
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
                <input
                  type="text"
                  value={newModelForm.description}
                  onChange={(e) => setNewModelForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g., Main UGC persona"
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
                />
              </div>
              <button
                onClick={async () => {
                  if (!newModelForm.name.trim()) {
                    showToast('Model name is required', 'error');
                    return;
                  }
                  setIsCreatingModel(true);
                  try {
                    const res = await fetch('/api/models', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newModelForm),
                    });
                    if (res.ok) {
                      setNewModelModal(false);
                      setNewModelForm({ name: '', description: '' });
                      showToast('Model created!', 'success');
                      loadModels();
                    } else {
                      const data = await res.json();
                      showToast(data.error || 'Failed', 'error');
                    }
                  } catch (e) {
                    showToast('Error creating model', 'error');
                  } finally {
                    setIsCreatingModel(false);
                  }
                }}
                disabled={isCreatingModel}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {isCreatingModel ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Model'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Detail Modal */}
      {modelDetailModal && selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setModelDetailModal(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-3">
                {selectedModel.avatarUrl ? (
                  <img src={selectedModel.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background)] text-xl">👤</div>
                )}
                <div>
                  <h3 className="text-lg font-semibold">{selectedModel.name}</h3>
                  <p className="text-sm text-[var(--text-muted)]">{selectedModel.description || 'No description'}</p>
                </div>
              </div>
              <button onClick={() => setModelDetailModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
            </div>
            <div className="p-4">
              <h4 className="mb-3 font-semibold">Images ({modelImages.length})</h4>

              {/* Drag and Drop Upload Area */}
              <label
                htmlFor="model-image-upload"
                className={`mb-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-all ${
                  modelImagesUploading
                    ? 'cursor-wait border-[var(--primary)] bg-[var(--primary)]/10 pointer-events-none'
                    : 'cursor-pointer border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] hover:bg-[var(--surface)]'
                }`}
                onDragOver={(e) => {
                  if (modelImagesUploading) return;
                  e.preventDefault();
                  e.currentTarget.classList.add('border-[var(--primary)]', 'bg-[var(--surface)]');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]');
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-[var(--primary)]', 'bg-[var(--surface)]');
                  const files = e.dataTransfer.files;
                  if (!files || files.length === 0) return;
                  setModelImagesUploading(true);
                  const formData = new FormData();
                  for (let i = 0; i < files.length; i++) {
                    formData.append('images', files[i]);
                  }
                  try {
                    const res = await fetch(`/api/models/${selectedModel.id}/images`, {
                      method: 'POST',
                      body: formData,
                    });
                    const data = await res.json();
                    if (res.ok) {
                      showToast(`Uploaded ${data.count} image${data.count > 1 ? 's' : ''}`, 'success');
                      await loadModelImages(selectedModel.id);
                      loadModels();
                    } else {
                      showToast(data.error || 'Upload failed', 'error');
                    }
                  } catch (err) {
                    console.error('Upload error:', err);
                    showToast('Upload failed: ' + (err instanceof Error ? err.message : 'Network error'), 'error');
                  } finally {
                    setModelImagesUploading(false);
                  }
                }}
              >
                {modelImagesUploading ? (
                  <>
                    <div className="mb-2 h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                    <div className="text-sm font-medium">Uploading...</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">Please wait</div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 text-4xl">+</div>
                    <div className="text-sm font-medium">Drop images here or click to upload</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">Supports JPG, PNG, WebP (multiple files)</div>
                  </>
                )}
                <input
                  id="model-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={modelImagesUploading}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    setModelImagesUploading(true);
                    const formData = new FormData();
                    for (const file of files) {
                      formData.append('images', file);
                    }
                    e.target.value = '';
                    try {
                      const res = await fetch(`/api/models/${selectedModel.id}/images`, {
                        method: 'POST',
                        body: formData,
                      });
                      const data = await res.json();
                      if (res.ok) {
                        showToast(`Uploaded ${data.count} image${data.count > 1 ? 's' : ''}`, 'success');
                        await loadModelImages(selectedModel.id);
                        loadModels();
                      } else {
                        showToast(data.error || 'Upload failed', 'error');
                      }
                    } catch (err) {
                      console.error('Upload error:', err);
                      showToast('Upload failed: ' + (err instanceof Error ? err.message : 'Network error'), 'error');
                    } finally {
                      setModelImagesUploading(false);
                    }
                  }}
                />
              </label>

              {/* Images Grid - always show when we have images or are uploading (so preview appears) */}
              {(modelImages.length > 0 || modelImagesUploading) && (
                <div className="grid grid-cols-4 gap-3">
                  {modelImages.map((img) => (
                    <div key={img.id} className="group relative">
                      <img
                        src={img.signedUrl || img.gcsUrl}
                        alt=""
                        className={`h-24 w-full rounded-lg object-cover ${img.isPrimary ? 'ring-2 ring-[var(--primary)]' : ''}`}
                      />
                      {img.isPrimary && (
                        <span className="absolute left-1 top-1 rounded bg-[var(--primary)] px-1 text-xs text-white">Primary</span>
                      )}
                      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!img.isPrimary && (
                          <button
                            onClick={async () => {
                              setIsSettingPrimary(img.id);
                              try {
                                await fetch(`/api/models/${selectedModel.id}/images/${img.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ isPrimary: true }),
                                });
                                loadModelImages(selectedModel.id);
                                loadModels();
                                showToast('Set as primary', 'success');
                              } finally {
                                setIsSettingPrimary(null);
                              }
                            }}
                            disabled={isSettingPrimary === img.id}
                            className="rounded bg-[var(--primary)] px-1 text-xs text-white disabled:opacity-50"
                          >
                            {isSettingPrimary === img.id ? '...' : '★'}
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this image?')) return;
                            setIsDeletingImage(img.id);
                            try {
                              await fetch(`/api/models/${selectedModel.id}/images/${img.id}`, { method: 'DELETE' });
                              loadModelImages(selectedModel.id);
                              loadModels();
                              showToast('Image deleted', 'success');
                            } finally {
                              setIsDeletingImage(null);
                            }
                          }}
                          disabled={isDeletingImage === img.id}
                          className="rounded bg-[var(--error)] px-1 text-xs text-white disabled:opacity-50"
                        >
                          {isDeletingImage === img.id ? '...' : '×'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Uploading placeholder */}
                  {modelImagesUploading && (
                    <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/10">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                    </div>
                  )}
                  {/* Add more images button in grid */}
                  <label
                    className={`flex h-24 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                      modelImagesUploading
                        ? 'cursor-wait border-[var(--border)] bg-[var(--background)] opacity-60'
                        : 'cursor-pointer border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background)]'
                    }`}
                  >
                    <span className="text-2xl text-[var(--text-muted)]">+</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={modelImagesUploading}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;
                        setModelImagesUploading(true);
                        const formData = new FormData();
                        for (const file of files) {
                          formData.append('images', file);
                        }
                        e.target.value = '';
                        try {
                          const res = await fetch(`/api/models/${selectedModel.id}/images`, {
                            method: 'POST',
                            body: formData,
                          });
                          const data = await res.json();
                          if (res.ok) {
                            showToast(`Uploaded ${data.count} image${data.count > 1 ? 's' : ''}`, 'success');
                            await loadModelImages(selectedModel.id);
                            loadModels();
                          } else {
                            showToast(data.error || 'Upload failed', 'error');
                          }
                        } catch (err) {
                          showToast('Upload failed', 'error');
                        } finally {
                          setModelImagesUploading(false);
                        }
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={async () => {
                    if (!confirm(`Delete model "${selectedModel.name}" and all its images?`)) return;
                    setIsDeletingModel(true);
                    try {
                      await fetch(`/api/models/${selectedModel.id}`, { method: 'DELETE' });
                      setModelDetailModal(false);
                      loadModels();
                      showToast('Model deleted', 'success');
                    } finally {
                      setIsDeletingModel(false);
                    }
                  }}
                  disabled={isDeletingModel}
                  className="flex items-center gap-2 rounded-lg border border-[var(--error)] bg-[var(--error-bg)] px-4 py-2 text-sm text-[var(--error)] disabled:opacity-50"
                >
                  {isDeletingModel ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Model'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Detail Modal */}
      {batchDetailModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBatchDetailModal(false)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedBatch.name}</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {selectedBatch.model?.name || 'Single image'} · {selectedBatch.completedJobs}/{selectedBatch.totalJobs} completed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                  selectedBatch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                  selectedBatch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                  selectedBatch.status === 'partial' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                  'bg-[var(--background)] text-[var(--text-muted)]'
                }`}>
                  {selectedBatch.status}
                </span>
                <button onClick={() => setBatchDetailModal(false)} className="text-2xl text-[var(--text-muted)]">&times;</button>
              </div>
            </div>
            <div className="p-4">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="mb-1 flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{selectedBatch.progress || 0}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--background)]">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${selectedBatch.progress || 0}%` }} />
                </div>
              </div>

              {/* Jobs list */}
              <h4 className="mb-3 font-semibold">Videos</h4>
              {selectedBatch.jobs?.length === 0 ? (
                <p className="text-[var(--text-muted)]">No videos in this batch</p>
              ) : (
                <div className="space-y-2">
                  {selectedBatch.jobs?.map((job) => (
                    <div key={job.id} className="flex items-center gap-4 rounded-lg bg-[var(--background)] p-3">
                      {(job.signedUrl || job.outputUrl) ? (
                        <div
                          className="group relative h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-lg"
                          onClick={() => setVideoPreviewModal({
                            url: job.signedUrl || job.outputUrl || '',
                            caption: job.videoSource === 'upload' ? 'Uploaded video' : (job.tiktokUrl || '')
                          })}
                        >
                          <video
                            src={job.signedUrl || job.outputUrl}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                              e.currentTarget.currentTime = 0.1;
                            }}
                          />
                          {/* Play button overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow">
                              <svg className="h-4 w-4 text-[var(--primary)] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-[var(--surface)] text-2xl">🎬</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {job.videoSource === 'upload' ? '📁 Uploaded video' : job.tiktokUrl}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{job.step}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        job.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                        job.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                        'bg-[var(--warning-bg)] text-[var(--warning)]'
                      }`}>
                        {job.status}
                      </span>
                      {job.status === 'completed' && (job.signedUrl || job.outputUrl) && (
                        <div className="flex gap-2">
                          <a
                            href={job.signedUrl || job.outputUrl}
                            download
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface)]"
                          >
                            Download
                          </a>
                          <button
                            onClick={() => {
                              setBatchDetailModal(false);
                              // Use outputUrl (GCS path) for backend upload, not signed URL
                              setPreselectedVideoPath(job.outputUrl!);
                              setPage('posts');
                              setTimeout(() => openCreatePostModal(job.outputUrl!), 100);
                            }}
                            className="rounded border border-[var(--accent-border)] bg-[var(--accent)] px-2 py-1 text-xs"
                          >
                            Post
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={async () => {
                    setIsRefreshingBatch(true);
                    try {
                      await loadBatchDetail(selectedBatch.id);
                    } finally {
                      setIsRefreshingBatch(false);
                    }
                  }}
                  disabled={isRefreshingBatch}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
                >
                  {isRefreshingBatch ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Refreshing...
                    </>
                  ) : (
                    'Refresh'
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this batch? Completed videos will be preserved.')) return;
                    setIsDeletingBatch(true);
                    try {
                      await fetch(`/api/batches/${selectedBatch.id}`, { method: 'DELETE' });
                      setBatchDetailModal(false);
                      loadBatches();
                      showToast('Batch deleted', 'success');
                    } finally {
                      setIsDeletingBatch(false);
                    }
                  }}
                  disabled={isDeletingBatch}
                  className="flex items-center gap-2 rounded-lg border border-[var(--error)] bg-[var(--error-bg)] px-4 py-2 text-sm text-[var(--error)] disabled:opacity-50"
                >
                  {isDeletingBatch ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Batch'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {videoPreviewModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setVideoPreviewModal(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
              <h3 className="truncate text-lg font-medium text-white">{videoPreviewModal.caption}</h3>
              <button
                onClick={() => setVideoPreviewModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Video Player */}
            <video
              src={videoPreviewModal.url}
              controls
              autoPlay
              className="h-auto max-h-[90vh] w-full"
              style={{ aspectRatio: '9/16', maxWidth: '100%', margin: '0 auto' }}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-8 right-8 z-[2000] rounded-lg px-6 py-3 shadow-lg transition-all ${
            toast.type === 'error' ? 'bg-[var(--error)]' : toast.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--primary)]'
          } text-white`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
