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
        fetch('/api/analytics/media?limit=5000', { cache: 'no-store' }),
      ]);

      const overviewData = overviewRes.ok ? await overviewRes.json() : null;
      const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] };
      const mediaData = mediaRes.ok ? await mediaRes.json() : { items: [] };

      // Only cache valid overview data (must have platformBreakdown, not an error object)
      if (overviewData && !overviewData.error) {
        _overviewCache = overviewData;
        setOverview(overviewData);
      }
      _accountsCache = accountsData.accounts || [];
      _mediaCache = mediaData.items || [];
      _cacheTime = Date.now();

      setAccounts(accountsData.accounts || []);
      setMediaItems(mediaData.items || []);
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
