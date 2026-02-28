'use client';

import { useEffect, useState, useCallback } from 'react';

export type ModelFilterOption = {
  id: string;
  name: string;
};

type ApiModel = {
  id?: string;
  name?: string;
};

const CACHE_TTL_MS = 60_000;

let _cache: ModelFilterOption[] = [];
let _cacheTime = 0;

function normalizeOptions(rows: ApiModel[]): ModelFilterOption[] {
  return rows
    .filter((row): row is Required<Pick<ApiModel, 'id' | 'name'>> => !!row.id && !!row.name)
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useModelFilterOptions() {
  const [models, setModels] = useState<ModelFilterOption[]>(_cache);
  const [isLoading, setIsLoading] = useState(_cache.length === 0);

  const loadModels = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _cache.length > 0 && now - _cacheTime < CACHE_TTL_MS) {
      setModels(_cache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const rows: ApiModel[] = Array.isArray(data) ? data : [];
      const normalized = normalizeOptions(rows);

      _cache = normalized;
      _cacheTime = Date.now();
      setModels(normalized);
    } catch (error) {
      console.error('Failed to load model filter options:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  return {
    models,
    isLoading,
    refreshModels: () => loadModels(true),
  };
}
