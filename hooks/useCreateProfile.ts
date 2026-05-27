'use client';

import { useCallback, useState } from 'react';

export type CreateProfileInput = {
  name: string;
  description?: string;
  apiKeyIndex?: number;
};

export function useCreateProfile() {
  const [isCreating, setIsCreating] = useState(false);

  const createProfile = useCallback(async (input: CreateProfileInput) => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/late/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create profile');
      }
      return data;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const setProfileCap = useCallback(async (apiKeyIndex: number, max: number) => {
    const res = await fetch('/api/late/profiles/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKeyIndex, max }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to set cap');
    }
    return res.json();
  }, []);

  return { createProfile, setProfileCap, isCreating };
}
