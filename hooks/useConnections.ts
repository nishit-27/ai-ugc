'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Profile, Account } from '@/types';
import { usePageVisibility } from './usePageVisibility';

const REFRESH_INTERVAL = 60_000;

// Module-level cache
let _profilesCache: Profile[] = [];
let _accountsCache: Account[] = [];
let _cacheTime = 0;

export function useConnections() {
  const isPageVisible = usePageVisibility();
  const [profiles, setProfiles] = useState<Profile[]>(_profilesCache);
  const [accounts, setAccounts] = useState<Account[]>(_accountsCache);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(_profilesCache.length === 0);
  const wasVisibleRef = useRef(isPageVisible);

  const loadConnections = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _profilesCache.length > 0 && now - _cacheTime < REFRESH_INTERVAL) {
      setProfiles(_profilesCache);
      setAccounts(_accountsCache);
      if (_profilesCache.length && !currentProfile) {
        setCurrentProfile(_profilesCache[0]);
      }
      setIsLoadingPage(false);
      return;
    }
    try {
      const [profilesRes, accountsRes] = await Promise.all([
        fetch('/api/late/profiles'),
        fetch('/api/late/accounts'),
      ]);
      const profilesData = await profilesRes.json();
      const accountsData = await accountsRes.json();
      const p = profilesData.profiles || [];
      const a = accountsData.accounts || [];
      _profilesCache = p;
      _accountsCache = a;
      _cacheTime = Date.now();
      setProfiles(p);
      setAccounts(a);
      if (p.length && !currentProfile) {
        setCurrentProfile(p[0]);
      }
    } catch (e) {
      console.error('Failed to load connections:', e);
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentProfile]);

  // Initial load (uses cache if fresh)
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // 60s baseline refresh
  useEffect(() => {
    if (!isPageVisible) return;
    const id = setInterval(() => loadConnections(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [isPageVisible, loadConnections]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isPageVisible;
    if (!wasVisible && isPageVisible) {
      void loadConnections(true);
    }
  }, [isPageVisible, loadConnections]);

  const profileAccounts = accounts.filter((a) => {
    const pId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
    return pId === currentProfile?._id;
  });

  const tiktokAccounts = accounts.filter((a) => a.platform === 'tiktok');

  const refresh = useCallback(() => loadConnections(true), [loadConnections]);

  return {
    profiles,
    accounts,
    currentProfile,
    setCurrentProfile,
    profileAccounts,
    tiktokAccounts,
    isLoadingPage,
    refresh,
  };
}
