'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AnalyticsAccount, AnalyticsOverview, AnalyticsMediaItem } from '@/types';

// Module-level cache
let _overviewCache: AnalyticsOverview | null = null;
let _accountsCache: AnalyticsAccount[] = [];
let _mediaCache: AnalyticsMediaItem[] = [];
let _cacheTime = 0;

export function useAnalytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(_overviewCache);
  const [accounts, setAccounts] = useState<AnalyticsAccount[]>(_accountsCache);
  const [mediaItems, setMediaItems] = useState<AnalyticsMediaItem[]>(_mediaCache);
  const [loading, setLoading] = useState(_accountsCache.length === 0);
  const [syncing, setSyncing] = useState(false);

  // Load data from our own DB (cheap, no external API calls)
  const loadData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _overviewCache && now - _cacheTime < 30_000) {
      setOverview(_overviewCache);
      setAccounts(_accountsCache);
      setMediaItems(_mediaCache);
      setLoading(false);
      return;
    }

    try {
      const [overviewRes, accountsRes, mediaRes] = await Promise.all([
        fetch('/api/analytics/overview', { cache: 'no-store' }),
        fetch('/api/analytics/accounts', { cache: 'no-store' }),
        fetch('/api/late-analytics?sortBy=date&order=desc', { cache: 'no-store' }),
      ]);

      const overviewData = overviewRes.ok ? await overviewRes.json() : null;
      const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] };
      const lateData = mediaRes.ok ? await mediaRes.json() : { posts: [] };

      // Map GetLate posts → AnalyticsMediaItem[]
      const latePosts = lateData.posts || [];
      const mappedMedia: AnalyticsMediaItem[] = [];
      for (const post of latePosts) {
        const a = (post as Record<string, unknown>).analytics as Record<string, number> || {};
        const platforms = ((post as Record<string, unknown>).platforms as Array<Record<string, string>>) || [];
        const base = {
          id: post._id || post.postId || '',
          externalId: post._id || post.postId || '',
          caption: post.content,
          url: post.platformPostUrl,
          thumbnailUrl: post.thumbnailUrl,
          publishedAt: post.publishedAt,
          views: Number(a.views || 0),
          likes: Number(a.likes || 0),
          comments: Number(a.comments || 0),
          shares: Number(a.shares || 0),
          saves: Number(a.saves || 0),
          engagementRate: Number(a.engagementRate || 0),
        };
        if (platforms.length === 0) {
          mappedMedia.push({ ...base, accountId: '', platform: '', accountUsername: '', accountDisplayName: '' });
        } else {
          for (const pl of platforms) {
            mappedMedia.push({
              ...base,
              accountId: pl.accountId || '',
              platform: pl.platform || '',
              accountUsername: pl.accountUsername || '',
              accountDisplayName: pl.accountUsername || '',
            });
          }
        }
      }

      // Only cache valid overview data (must have platformBreakdown, not an error object)
      if (overviewData && !overviewData.error) {
        _overviewCache = overviewData;
        setOverview(overviewData);
      }
      _accountsCache = accountsData.accounts || [];
      _mediaCache = mappedMedia;
      _cacheTime = Date.now();

      setAccounts(accountsData.accounts || []);
      setMediaItems(mappedMedia);
      return _accountsCache;
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from DB on mount (no external API calls)
  useEffect(() => {
    loadData();
  }, [loadData]);

  const addAccount = useCallback(async (platform: string, username: string) => {
    try {
      setSyncing(true);
      const res = await fetch('/api/analytics/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add account');
      await loadData(true);
      return data;
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  const removeAccount = useCallback(async (id: string) => {
    await fetch(`/api/analytics/accounts/${id}`, { method: 'DELETE' });
    await loadData(true);
  }, [loadData]);

  const refreshAccount = useCallback(async (id: string) => {
    try {
      setSyncing(true);
      await fetch(`/api/analytics/accounts/${id}/refresh`, { method: 'POST' });
      await loadData(true);
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  // Hard Sync: always full sync, respects once-per-day guard unless forced
  const hardSync = useCallback(async (force = false) => {
    try {
      setSyncing(true);
      const url = force ? '/api/analytics/refresh?force=true' : '/api/analytics/refresh';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      await loadData(true);
      return data;
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  return {
    overview,
    accounts,
    mediaItems,
    loading,
    syncing,
    addAccount,
    removeAccount,
    refreshAccount,
    hardSync,
    reload: () => loadData(true),
  };
}
