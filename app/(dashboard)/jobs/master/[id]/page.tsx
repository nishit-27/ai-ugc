'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PipelineBatch, TemplateJob, MasterConfig } from '@/types';
import { useToast } from '@/hooks/useToast';
import Spinner from '@/components/ui/Spinner';
import MasterBatchHeader from '@/components/templates/master-batch/MasterBatchHeader';
import MasterBatchVideoGrid from '@/components/templates/master-batch/MasterBatchVideoGrid';
import MasterBatchSelectionBar from '@/components/templates/master-batch/MasterBatchSelectionBar';
import MasterBatchModals from '@/components/templates/master-batch/MasterBatchModals';
import EditMasterConfigModal from '@/components/templates/master-batch/EditMasterConfigModal';
import EditJobOverridesModal from '@/components/templates/master-batch/EditJobOverridesModal';
const _cache: Record<string, PipelineBatch & { jobs?: TemplateJob[] }> = {};

async function signUrls(urls: string[]): Promise<Record<string, string>> {
  if (urls.length === 0) return {};
  try {
    const res = await fetch('/api/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.signed || {};
    }
  } catch {}
  return {};
}

export default function MasterBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [batch, setBatch] = useState<(PipelineBatch & { jobs?: TemplateJob[] }) | null>(_cache[id] || null);
  const [isLoading, setIsLoading] = useState(!_cache[id]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFailingProcessing, setIsFailingProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [modalJob, setModalJob] = useState<TemplateJob | null>(null);
  const [posting, setPosting] = useState(false);
  const [busyJobIds, setBusyJobIds] = useState<Set<string>>(new Set());
  const inflightRef = useRef(new Set<string>());
  const addBusy = (jid: string) => { inflightRef.current.add(jid); setBusyJobIds(prev => new Set(prev).add(jid)); };
  const removeBusy = (jid: string) => { inflightRef.current.delete(jid); setBusyJobIds(prev => { const next = new Set(prev); next.delete(jid); return next; }); };
  const [regenerateJob, setRegenerateJob] = useState<TemplateJob | null>(null);
  const [showEditConfig, setShowEditConfig] = useState(false);
  const [editOverridesJob, setEditOverridesJob] = useState<TemplateJob | null>(null);

  const [signedModelImages, setSignedModelImages] = useState<Record<string, string>>({});
  const [jobPosts, setJobPosts] = useState<Record<string, { platform: string; status: string; platformPostUrl?: string; latePostId?: string }[]>>({});

  const masterConfig: MasterConfig | undefined = batch?.masterConfig;
  const jobs = useMemo<TemplateJob[]>(() => batch?.jobs || [], [batch?.jobs]);

  // Build model name + image lookup from masterConfig
  const modelNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    masterConfig?.models?.forEach((m) => { map[m.modelId] = m.modelName; });
    return map;
  }, [masterConfig]);

  const modelImageMap = useMemo(() => {
    const map: Record<string, string> = {};
    masterConfig?.models?.forEach((m) => {
      const signed = signedModelImages[m.primaryImageUrl];
      map[m.modelId] = signed || m.primaryImageUrl;
    });
    return map;
  }, [masterConfig, signedModelImages]);

  const loadBatch = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const res = await fetch(`/api/pipeline-batches/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();

      // Server already signs output URLs — no need to re-sign on client

      // Update batch state immediately so UI reflects changes
      _cache[id] = data;
      setBatch(data);

      // Sign model image URLs from masterConfig (non-blocking)
      const mc = data.masterConfig as MasterConfig | undefined;
      if (mc?.models?.length) {
        const modelImageUrls = mc.models
          .map((m: { primaryImageUrl: string }) => m.primaryImageUrl)
          .filter((u: string) => u && u.includes('storage.googleapis.com'));
        if (modelImageUrls.length > 0) {
          try {
            const signedImages = await signUrls(modelImageUrls);
            setSignedModelImages((prev) => ({ ...prev, ...signedImages }));
          } catch {}
        }
      }

      // Fetch local post records for approved jobs (non-blocking)
      const postedJobs = (data.jobs || []).filter((j: TemplateJob) => j.postStatus === 'posted');
      if (postedJobs.length > 0) {
        try {
          const postRes = await fetch('/api/posts/by-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobIds: postedJobs.map((j: TemplateJob) => j.id) }),
          });
          if (postRes.ok) {
            const postData = await postRes.json();
            const postsMap: Record<string, { platform: string; status: string; platformPostUrl?: string; latePostId?: string }[]> = {};
            for (const post of postData.posts || []) {
              if (!postsMap[post.jobId]) postsMap[post.jobId] = [];
              postsMap[post.jobId].push({
                platform: post.platform,
                status: post.status,
                platformPostUrl: post.platformPostUrl,
                latePostId: post.latePostId,
              });
            }
            setJobPosts(postsMap);
          }
        } catch {}
      }
    } catch {
      showToast('Failed to load master batch', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadBatch(!_cache[id]);
  }, [id, loadBatch]);

  // Auto-refresh while any job is still processing/queued
  const hasActiveJobs = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
  const batchStatus = batch?.status;
  useEffect(() => {
    const isActive = batchStatus === 'pending' || batchStatus === 'processing' || hasActiveJobs;
    if (!isActive) return;
    const interval = setInterval(() => loadBatch(), 3000);
    return () => clearInterval(interval);
  }, [batchStatus, hasActiveJobs, loadBatch]);

  // Selectable completed jobs (not yet posted/rejected)
  const selectableJobs = useMemo(
    () => jobs.filter((j) => j.status === 'completed' && !j.postStatus),
    [jobs],
  );

  const toggleJob = (id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedJobIds(new Set(selectableJobs.map((j) => j.id)));
  };

  const clearSelection = () => {
    setSelectedJobIds(new Set());
  };

  const handlePostSelected = async () => {
    if (selectedJobIds.size === 0 || posting) return;
    setPosting(true);
    try {
      const ids = Array.from(selectedJobIds);

      const res = await fetch(`/api/templates/master/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to approve videos', 'error');
      } else {
        const posted = Number(data.summary?.posted || 0);
        const skipped = Number(data.summary?.skipped || 0);
        const failed = Number(data.summary?.failed || 0);

        if (failed > 0) {
          showToast(`Approve finished: ${posted} posted, ${skipped} skipped, ${failed} failed.`, 'error');
        } else if (posted > 0) {
          const skippedText = skipped > 0 ? `, ${skipped} skipped` : '';
          showToast(`Approved & posted ${posted} video${posted > 1 ? 's' : ''}${skippedText}.`, 'success');
        } else if (skipped > 0) {
          showToast(`No new posts created (${skipped} skipped).`, 'success');
        } else {
          showToast(`Approved ${ids.length} video${ids.length > 1 ? 's' : ''}!`, 'success');
        }
      }

      setSelectedJobIds(new Set());
      await loadBatch();
    } catch {
      showToast('Failed to approve videos', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedJobIds.size === 0) return;
    for (const jobId of selectedJobIds) {
      await fetch(`/api/templates/${jobId}/post-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postStatus: 'rejected' }),
      });
    }
    showToast(`Rejected ${selectedJobIds.size} video${selectedJobIds.size > 1 ? 's' : ''}`, 'success');
    setSelectedJobIds(new Set());
    await loadBatch();
  };

  const handleSinglePost = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (posting || job?.postStatus === 'posted' || inflightRef.current.has(jobId)) return;

    addBusy(jobId);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
      let res: Response;
      try {
        res = await fetch(`/api/templates/master/${id}/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobIds: [jobId] }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();
      if (res.ok && data.summary?.posted > 0) {
        showToast('Approved & posted!', 'success');
      } else if (res.ok && data.summary?.skipped > 0) {
        const result = Array.isArray(data.results)
          ? data.results.find((r: { jobId?: string }) => r?.jobId === jobId)
          : null;
        const reason = typeof result?.error === 'string' ? result.error : '';
        const normalizedReason = reason.toLowerCase();
        if (normalizedReason.includes('no social accounts linked')) {
          showToast('Approved! No social accounts linked — go to /models to link accounts.', 'success');
        } else if (
          normalizedReason.includes('already posted') ||
          normalizedReason.includes('already being posted') ||
          normalizedReason.includes('model already posted')
        ) {
          showToast('Already approved.', 'success');
        } else if (reason) {
          showToast(`Skipped: ${reason}`, 'success');
        } else {
          showToast('No new post created for this video.', 'success');
        }
      } else if (res.ok && data.summary?.failed > 0) {
        const result = Array.isArray(data.results)
          ? data.results.find((r: { jobId?: string }) => r?.jobId === jobId)
          : null;
        showToast((typeof result?.error === 'string' && result.error) || 'Failed to approve', 'error');
      } else if (res.ok) {
        showToast('Approved!', 'success');
      } else {
        showToast(data.error || 'Failed to approve', 'error');
      }

      setModalJob(null);
      await loadBatch();
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Approve timed out — check server logs'
        : 'Failed to approve';
      showToast(msg, 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const handleRepost = async (jobId: string) => {
    if (posting || inflightRef.current.has(jobId)) return;
    addBusy(jobId);
    try {
      const res = await fetch(`/api/templates/master/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: [jobId], force: true }),
      });
      const data = await res.json();
      if (res.ok && data.summary?.posted > 0) {
        showToast('Reposted successfully!', 'success');
      } else if (res.ok && data.summary?.skipped > 0) {
        showToast('No social accounts linked — go to /models to link accounts.', 'error');
      } else {
        showToast('Failed to repost', 'error');
      }
      setModalJob(null);
      await loadBatch();
    } catch {
      showToast('Failed to repost', 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const handleQuickRegenerate = async (jobId: string) => {
    addBusy(jobId);
    try {
      const res = await fetch(`/api/templates/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast('Regenerating video...', 'success');
        setModalJob(null);
        await loadBatch();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to regenerate', 'error');
      }
    } catch {
      showToast('Failed to regenerate', 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const openRegenerateModal = (job: TemplateJob) => {
    setRegenerateJob(job);
  };

  // Compute which jobs have overrides
  const jobsWithOverrides = useMemo(() => {
    const set = new Set<string>();
    for (const job of jobs) {
      if (job.captionOverride || job.publishModeOverride) {
        set.add(job.id);
      }
    }
    return set;
  }, [jobs]);

  // Global config edit handler
  const handleSaveGlobalConfig = async (updates: { caption: string; publishMode: MasterConfig['publishMode']; scheduledFor?: string; timezone?: string }) => {
    const res = await fetch(`/api/pipeline-batches/${id}/master-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      showToast('Failed to update config', 'error');
      throw new Error('Failed');
    }
    showToast('Global caption & timing updated', 'success');
    await loadBatch();
  };

  // Per-job overrides handler
  const handleSaveJobOverrides = async (jobId: string, overrides: {
    captionOverride: string | null;
    publishModeOverride: MasterConfig['publishMode'] | null;
    scheduledForOverride: string | null;
    timezoneOverride: string | null;
  }) => {
    const res = await fetch(`/api/templates/${jobId}/overrides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides),
    });
    if (!res.ok) {
      showToast('Failed to update overrides', 'error');
      throw new Error('Failed');
    }
    const isReset = !overrides.captionOverride && !overrides.publishModeOverride;
    showToast(isReset ? 'Reset to global settings' : 'Video settings updated', 'success');
    setModalJob(null);
    await loadBatch();
  };

  const handleRegenStep = async (jobId: string, stepIndex: number) => {
    addBusy(jobId);
    try {
      const res = await fetch(`/api/templates/${jobId}/regen-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex }),
      });
      if (res.ok) {
        showToast(`Re-running from step ${stepIndex + 1}...`, 'success');
        setModalJob(null);
        await loadBatch();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to regenerate step', 'error');
      }
    } catch {
      showToast('Failed to regenerate step', 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const handleEditRegenerate = async (jobId: string, overrides?: { imageUrl?: string; imageId?: string }) => {
    setRegenerateJob(null);
    addBusy(jobId);
    try {
      const res = await fetch(`/api/templates/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides || {}),
      });
      if (res.ok) {
        showToast(overrides?.imageUrl ? 'Regenerating with new image...' : 'Regenerating video...', 'success');
        setModalJob(null);
        await loadBatch();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to regenerate', 'error');
      }
    } catch {
      showToast('Failed to regenerate', 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const handleSingleReject = async (jobId: string) => {
    addBusy(jobId);
    try {
      await fetch(`/api/templates/${jobId}/post-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postStatus: 'rejected' }),
      });
      showToast('Video rejected', 'success');
      setModalJob(null);
      await loadBatch();
    } catch {
      showToast('Failed to reject', 'error');
    } finally {
      removeBusy(jobId);
    }
  };

  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const processingCount = jobs.filter((j) => j.status === 'processing').length;

  const handleFailQueued = async () => {
    if (queuedCount === 0) return;
    if (!confirm(`Mark ${queuedCount} stuck queued job${queuedCount > 1 ? 's' : ''} as failed? You can then retry them individually.`)) return;
    try {
      const res = await fetch(`/api/pipeline-batches/${id}/fail-queued`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Marked ${data.failedCount} queued job${data.failedCount > 1 ? 's' : ''} as failed — you can now retry them`, 'success');
        await loadBatch();
      } else {
        showToast(data.error || 'Failed to update jobs', 'error');
      }
    } catch {
      showToast('Failed to update jobs', 'error');
    }
  };

  const handleFailProcessing = async () => {
    if (processingCount === 0) return;
    if (!confirm(`Mark ${processingCount} stuck processing job${processingCount > 1 ? 's' : ''} as failed? Use this only if they are clearly stuck. You can regenerate them individually afterward.`)) return;
    setIsFailingProcessing(true);
    try {
      const res = await fetch(`/api/pipeline-batches/${id}/fail-processing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Marked ${data.failedCount} processing job${data.failedCount > 1 ? 's' : ''} as failed`, 'success');
        await loadBatch();
      } else {
        showToast(data.error || 'Failed to update jobs', 'error');
      }
    } catch {
      showToast('Failed to update jobs', 'error');
    } finally {
      setIsFailingProcessing(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!batch) return;
    if (!confirm('Delete this master batch?')) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/pipeline-batches/${batch.id}`, { method: 'DELETE' });
      showToast('Batch deleted', 'success');
      router.push('/jobs?tab=master');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApproveAll = async () => {
    if (selectableJobs.length === 0 || posting) return;
    if (!confirm(`Approve all ${selectableJobs.length} videos?`)) return;
    setPosting(true);
    try {
      const ids = selectableJobs.map((job) => job.id);
      const res = await fetch(`/api/templates/master/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to approve all', 'error');
      } else {
        const posted = Number(data.summary?.posted || 0);
        const skipped = Number(data.summary?.skipped || 0);
        const failed = Number(data.summary?.failed || 0);

        if (failed > 0) {
          showToast(`Approve-all finished: ${posted} posted, ${skipped} skipped, ${failed} failed.`, 'error');
        } else if (posted > 0) {
          const skippedText = skipped > 0 ? `, ${skipped} skipped` : '';
          showToast(`Approved & posted ${posted} video${posted > 1 ? 's' : ''}${skippedText}.`, 'success');
        } else if (skipped > 0) {
          showToast(`No new posts created (${skipped} skipped).`, 'success');
        } else {
          showToast(`Approved all ${ids.length} videos!`, 'success');
        }
      }
      await loadBatch();
    } catch {
      showToast('Failed to approve all', 'error');
    } finally {
      setPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8 text-[var(--primary)]" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="py-20 text-center">
        <h2 className="mb-2 text-xl font-semibold">Batch not found</h2>
        <Link href="/jobs?tab=master" className="text-sm text-[var(--primary)] hover:underline">Back to jobs</Link>
      </div>
    );
  }

  const isActive = batch.status === 'pending' || batch.status === 'processing';
  const progress = batch.totalJobs > 0 ? Math.round((batch.completedJobs / batch.totalJobs) * 100) : 0;
  const pending = batch.totalJobs - batch.completedJobs - batch.failedJobs;
  const allSelected = selectableJobs.length > 0 && selectableJobs.every((j) => selectedJobIds.has(j.id));

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6 px-3 sm:px-0 pb-20">
      <MasterBatchHeader
        batch={batch}
        masterConfig={masterConfig}
        isActive={isActive}
        progress={progress}
        pending={pending}
        queuedCount={queuedCount}
        processingCount={processingCount}
        isRefreshing={isRefreshing}
        isDeleting={isDeleting || isFailingProcessing}
        onRefresh={() => {
          setIsRefreshing(true);
          loadBatch();
        }}
        onDelete={handleDeleteBatch}
        onEditConfig={() => setShowEditConfig(true)}
        onFailQueued={handleFailQueued}
        onFailProcessing={handleFailProcessing}
      />

      <MasterBatchVideoGrid
        jobs={jobs}
        selectableJobs={selectableJobs}
        selectedJobIds={selectedJobIds}
        allSelected={allSelected}
        posting={posting}
        busyJobIds={busyJobIds}
        modelNameMap={modelNameMap}
        modelImageMap={modelImageMap}
        onApproveAll={handleApproveAll}
        onToggleSelectAll={allSelected ? clearSelection : selectAll}
        onToggleJob={toggleJob}
        onOpenJob={setModalJob}
        onApproveJob={handleSinglePost}
        onRejectJob={handleSingleReject}
        onRepostJob={handleRepost}
        onQuickRegenerateJob={handleQuickRegenerate}
        onEditRegenerateJob={openRegenerateModal}
        onEditJobOverrides={setEditOverridesJob}
        jobsWithOverrides={jobsWithOverrides}
      />

      <MasterBatchSelectionBar
        selectedCount={selectedJobIds.size}
        posting={posting}
        onRejectSelected={handleRejectSelected}
        onApproveSelected={handlePostSelected}
      />

      <MasterBatchModals
        modalJob={modalJob}
        regenerateJob={regenerateJob}
        masterConfig={masterConfig}
        signedModelImages={signedModelImages}
        jobPosts={jobPosts}
        busyJobIds={busyJobIds}
        onCloseModalJob={() => setModalJob(null)}
        onCloseRegenerate={() => setRegenerateJob(null)}
        onPost={handleSinglePost}
        onRepost={handleRepost}
        onReject={handleSingleReject}
        onQuickRegenerate={handleQuickRegenerate}
        onRegenStep={handleRegenStep}
        onEditRegenerateOpen={openRegenerateModal}
        onEditRegenerateSubmit={handleEditRegenerate}
        onEditJobOverrides={setEditOverridesJob}
        jobsWithOverrides={jobsWithOverrides}
      />
      {showEditConfig && masterConfig && (
        <EditMasterConfigModal
          masterConfig={masterConfig}
          onClose={() => setShowEditConfig(false)}
          onSave={handleSaveGlobalConfig}
        />
      )}

      {editOverridesJob && masterConfig && (
        <EditJobOverridesModal
          job={editOverridesJob}
          masterConfig={masterConfig}
          modelName={editOverridesJob.modelId ? modelNameMap[editOverridesJob.modelId] : undefined}
          onClose={() => setEditOverridesJob(null)}
          onSave={handleSaveJobOverrides}
        />
      )}
    </div>
  );
}
