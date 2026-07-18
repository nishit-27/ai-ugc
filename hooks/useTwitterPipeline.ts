'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  TwitterPipelineStep,
  TwitterStepType,
  TwitterTweetConfig,
  TwitterThreadConfig,
  TwitterReplyConfig,
  TwitterQuoteConfig,
  TwitterEngageConfig,
  TwitterMediaConfig,
  TwitterPipeline,
  Account,
  Model,
} from '@/types';

const DRAFT_KEY = 'twitter-pipeline-draft';

function generateId() {
  return crypto.randomUUID();
}

function defaultConfig(type: TwitterStepType): TwitterPipelineStep['config'] {
  switch (type) {
    case 'tweet':
      return { content: '', mode: 'manual' } as TwitterTweetConfig;
    case 'thread':
      return {
        items: [
          { id: generateId(), content: '' },
          { id: generateId(), content: '' },
        ],
        mode: 'manual',
      } as TwitterThreadConfig;
    case 'reply':
      return { tweetUrl: '', content: '', mode: 'manual' } as TwitterReplyConfig;
    case 'quote':
      return { tweetUrl: '', content: '', mode: 'manual' } as TwitterQuoteConfig;
    case 'engage':
      return {
        tweetUrl: '',
        actions: { retweet: false, like: false, bookmark: false },
      } as TwitterEngageConfig;
    case 'media':
      return { source: 'upload' } as TwitterMediaConfig;
  }
}

export function useTwitterPipeline() {
  const [steps, setSteps] = useState<TwitterPipelineStep[]>([]);
  const [pipelineName, setPipelineName] = useState('Untitled Twitter Pipeline');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [twitterAccounts, setTwitterAccounts] = useState<Account[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>('draft');
  const [savedPipelines, setSavedPipelines] = useState<TwitterPipeline[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [twitterAccountCounts, setTwitterAccountCounts] = useState<Record<string, number>>({});
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'queue' | 'draft'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Load draft from sessionStorage
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.steps) setSteps(parsed.steps);
        if (parsed.pipelineName) setPipelineName(parsed.pipelineName);
        if (parsed.accountIds) setAccountIds(parsed.accountIds);
        if (parsed.selectedModelIds) setSelectedModelIds(parsed.selectedModelIds);
        if (parsed.publishMode) setPublishMode(parsed.publishMode);
        if (parsed.scheduledFor) setScheduledFor(parsed.scheduledFor);
        if (parsed.timezone) setTimezone(parsed.timezone);
      }
    } catch {}
  }, []);

  // Auto-save draft
  useEffect(() => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ steps, pipelineName, accountIds, selectedModelIds, publishMode, scheduledFor, timezone })
    );
  }, [steps, pipelineName, accountIds, selectedModelIds, publishMode, scheduledFor, timezone]);

  // Fetch Twitter accounts
  const fetchAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch('/api/late/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      const allAccounts: Account[] = data.accounts || [];
      const xAccounts = allAccounts.filter(
        (a) => a.platform === 'twitter' || a.platform === 'x'
      );
      setTwitterAccounts(xAccounts);
    } catch (err) {
      console.error('Failed to fetch Twitter accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Fetch models — /api/models already returns accountCount and linkedPlatforms
  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      const models: Model[] = Array.isArray(data) ? data : data.models || [];
      setAllModels(models);

      // Derive Twitter account counts from linkedPlatforms
      const counts: Record<string, number> = {};
      for (const model of models) {
        const platforms = model.linkedPlatforms || [];
        if (platforms.includes('twitter') || platforms.includes('x')) {
          counts[model.id] = model.accountCount || 1;
        }
      }
      setTwitterAccountCounts(counts);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Fetch saved pipelines
  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch('/api/twitter/pipelines');
      if (!res.ok) return;
      const data = await res.json();
      setSavedPipelines(data.pipelines || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // Step CRUD
  const addStep = useCallback((type: TwitterStepType) => {
    const newStep: TwitterPipelineStep = {
      id: generateId(),
      type,
      config: defaultConfig(type),
      enabled: true,
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStepId(newStep.id);
    return newStep;
  }, []);

  const removeStep = useCallback(
    (stepId: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== stepId));
      if (selectedStepId === stepId) setSelectedStepId(null);
    },
    [selectedStepId]
  );

  const updateStepConfig = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stepId: string, config: Record<string, any>) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, config: { ...s.config, ...config } as TwitterPipelineStep['config'] }
            : s
        )
      );
    },
    []
  );

  const toggleStep = useCallback((stepId: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const reorderSteps = useCallback((fromIndex: number, toIndex: number) => {
    setSteps((prev) => {
      const newSteps = [...prev];
      const [moved] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, moved);
      return newSteps;
    });
  }, []);

  const selectedStep = steps.find((s) => s.id === selectedStepId) || null;

  // Fetch tweet context
  const fetchTweetContext = useCallback(async (url: string) => {
    try {
      const res = await fetch(
        `/api/twitter/fetch-tweet?url=${encodeURIComponent(url)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.tweet || null;
    } catch {
      return null;
    }
  }, []);

  // Generate tweet with AI
  const generateTweet = useCallback(
    async (params: {
      mode: 'generate' | 'enhance';
      type?: 'tweet' | 'thread' | 'reply' | 'quote';
      genre?: string;
      topic?: string;
      contextTweet?: unknown;
      currentContent?: string;
      threadItemCount?: number;
    }) => {
      setIsGenerating(true);
      try {
        const res = await fetch('/api/twitter/generate-tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) throw new Error('Generation failed');
        return await res.json();
      } catch (err) {
        console.error('Generate tweet error:', err);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  // Upload a media file to R2 and return its public URL.
  const uploadMedia = useCallback(async (file: File): Promise<string | null> => {
    const isVideo = file.type.startsWith('video') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    const endpoint = isVideo ? '/api/upload-video' : '/api/upload-image';
    const field = isVideo ? 'video' : 'image';
    const fd = new FormData();
    fd.append(field, file);
    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.url || data.gcsUrl || null;
    } catch (err) {
      console.error('Media upload error:', err);
      return null;
    }
  }, []);

  // Save pipeline — persists models, publish mode and schedule. Returns the id.
  const savePipeline = useCallback(async (): Promise<string | null> => {
    const payload = {
      name: pipelineName,
      steps,
      accountIds,
      modelIds: selectedModelIds,
      publishMode,
      scheduledFor: publishMode === 'schedule' ? scheduledFor : undefined,
      timezone,
    };
    try {
      if (pipelineId) {
        await fetch(`/api/twitter/pipelines/${pipelineId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        fetchPipelines();
        return pipelineId;
      }
      const res = await fetch('/api/twitter/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const newId = data.pipeline?.id || null;
      if (newId) setPipelineId(newId);
      fetchPipelines();
      return newId;
    } catch (err) {
      console.error('Save pipeline error:', err);
      return pipelineId;
    }
  }, [pipelineId, pipelineName, steps, accountIds, selectedModelIds, publishMode, scheduledFor, timezone, fetchPipelines]);

  // Execute pipeline — always saves the latest config first so the server runs
  // with the current models/steps/mode, then kicks off the background run.
  const executePipeline = useCallback(async () => {
    setExecuteError(null);
    if (steps.filter((s) => s.enabled).length === 0) {
      setExecuteError('Add at least one enabled step before running.');
      return;
    }
    if (selectedModelIds.length === 0) {
      setExecuteError('Select at least one model with a connected X account.');
      return;
    }
    if (publishMode === 'schedule' && !scheduledFor) {
      setExecuteError('Pick a date & time for scheduled mode.');
      return;
    }

    setIsExecuting(true);
    setPipelineStatus('running');
    try {
      const id = await savePipeline();
      if (!id) throw new Error('Could not save pipeline before running.');

      const res = await fetch('/api/twitter/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Execution failed');
      }
      setPipelineStatus('running');
    } catch (err) {
      console.error('Execute pipeline error:', err);
      setPipelineStatus('failed');
      setExecuteError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  }, [steps, selectedModelIds, publishMode, scheduledFor, savePipeline]);

  // Load pipeline
  const loadPipeline = useCallback((pipeline: TwitterPipeline) => {
    setPipelineId(pipeline.id);
    setPipelineName(pipeline.name);
    setSteps(pipeline.steps);
    setAccountIds(pipeline.accountIds || []);
    setSelectedModelIds(pipeline.modelIds || []);
    if (pipeline.publishMode) setPublishMode(pipeline.publishMode);
    if (pipeline.timezone) setTimezone(pipeline.timezone);
    setPipelineStatus(pipeline.status);
    setExecuteError(null);
    setSelectedStepId(null);
  }, []);

  // Clear pipeline
  const clearPipeline = useCallback(() => {
    setPipelineId(null);
    setPipelineName('Untitled Twitter Pipeline');
    setSteps([]);
    setAccountIds([]);
    setSelectedModelIds([]);
    setPipelineStatus('draft');
    setSelectedStepId(null);
    setPublishMode('now');
    setScheduledFor('');
    setExecuteError(null);
    sessionStorage.removeItem(DRAFT_KEY);
  }, []);

  // Search tweets
  const searchTweets = useCallback(
    async (query: string, minLikes = 100, limit = 10) => {
      try {
        const res = await fetch(
          `/api/twitter/search?query=${encodeURIComponent(query)}&minLikes=${minLikes}&limit=${limit}`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.tweets || [];
      } catch {
        return [];
      }
    },
    []
  );

  // Get trending
  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch('/api/twitter/trending');
      if (!res.ok) return [];
      const data = await res.json();
      return data.trends || [];
    } catch {
      return [];
    }
  }, []);

  return {
    // State
    steps,
    pipelineName,
    setPipelineName,
    selectedStep,
    selectedStepId,
    setSelectedStepId,
    accountIds,
    setAccountIds,
    twitterAccounts,
    isLoadingAccounts,
    isExecuting,
    executeError,
    setExecuteError,
    isGenerating,
    pipelineId,
    pipelineStatus,
    savedPipelines,
    // Model selection
    allModels,
    isLoadingModels,
    twitterAccountCounts,
    selectedModelIds,
    setSelectedModelIds,
    publishMode,
    setPublishMode,
    scheduledFor,
    setScheduledFor,
    timezone,
    setTimezone,
    // Media
    uploadMedia,
    // Step actions
    addStep,
    removeStep,
    updateStepConfig,
    toggleStep,
    reorderSteps,
    // Pipeline actions
    savePipeline,
    executePipeline,
    loadPipeline,
    clearPipeline,
    // Twitter API
    fetchTweetContext,
    generateTweet,
    searchTweets,
    fetchTrending,
    fetchAccounts,
  };
}
