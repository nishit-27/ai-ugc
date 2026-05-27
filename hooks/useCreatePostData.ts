'use client';

import { useEffect, useState } from 'react';
import type { Account, Profile } from '@/types';

export type ShortVideo = { name: string; path: string; url?: string };
export type ModelGroupForPost = { name: string; accountIds: string[] };

// Loads the four lists CreatePostModal needs whenever it opens.
// Returns the data + a single isLoading flag plus a refresh() callback
// for callers that want to invalidate the cache (e.g. after creating a new
// profile in an adjacent modal).
export function useCreatePostData(isOpen: boolean) {
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroupForPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      fetch('/api/videos').then((r) => r.json()),
      fetch('/api/late/accounts').then((r) => r.json()),
      fetch('/api/late/profiles').then((r) => r.json()),
      fetch('/api/model-groups/accounts').then((r) => r.json()),
    ])
      .then(([videosData, accountsData, profilesData, groupsData]) => {
        if (cancelled) return;
        setVideos(videosData.videos || []);
        setAccounts(accountsData.accounts || []);
        setProfiles(profilesData.profiles || []);
        setModelGroups(groupsData.groups || []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, refreshTick]);

  return {
    videos,
    accounts,
    profiles,
    modelGroups,
    isLoading,
    refresh: () => setRefreshTick((t) => t + 1),
  };
}
