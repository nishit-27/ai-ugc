'use client';

import { useCallback, useState } from 'react';

export type CreateModelInput = {
  name: string;
  description?: string;
  groupNames?: string[];
};

export function useCreateModel() {
  const [isCreating, setIsCreating] = useState(false);

  const createModel = useCallback(async (input: CreateModelInput) => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create model');
      }
      return res.json();
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { createModel, isCreating };
}
