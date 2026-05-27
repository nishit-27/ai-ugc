'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Account, GeneratedImage, ModelAccountMapping } from '@/types';

// One hook for everything ModelDetailModal needs to talk to the API for.
// Three GETs on open + 8 mutations. The component still owns local UI
// state (which image is being deleted, toast, optimistic flags) — this
// hook just owns the HTTP boundary.
export function useModelDetail(modelId: string | undefined, isOpen: boolean) {
  const [accountMappings, setAccountMappings] = useState<ModelAccountMapping[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingGeneratedImages, setIsLoadingGeneratedImages] = useState(false);

  useEffect(() => {
    if (!isOpen || !modelId) return;
    let cancelled = false;
    setIsLoadingAccounts(true);
    Promise.all([
      fetch(`/api/models/${modelId}/accounts`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/late/accounts').then((r) => (r.ok ? r.json() : { accounts: [] })),
    ])
      .then(([mappings, accountsData]) => {
        if (cancelled) return;
        setAccountMappings(Array.isArray(mappings) ? mappings : []);
        setAllAccounts(accountsData.accounts || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, modelId]);

  useEffect(() => {
    if (!isOpen || !modelId) return;
    let cancelled = false;
    setIsLoadingGeneratedImages(true);
    fetch(`/api/generated-images?modelId=${modelId}&limit=100`)
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((data) => {
        if (cancelled) return;
        setGeneratedImages(data.images || []);
      })
      .catch(() => {
        if (!cancelled) setGeneratedImages([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingGeneratedImages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, modelId]);

  // Mutation helpers — each returns a Promise that throws on error so callers
  // can surface their own toast messages and bail without inspecting status codes.
  const patchModel = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!modelId) throw new Error('no model id');
      const res = await fetch(`/api/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        let msg = 'Request failed';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    [modelId],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!modelId) throw new Error('no model id');
      const formData = new FormData();
      formData.append('images', file);
      const res = await fetch(`/api/models/${modelId}/images`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        let msg = `Upload failed (${res.status})`;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ count: number }>;
    },
    [modelId],
  );

  const addImageFromUrl = useCallback(
    async (sourceUrl: string) => {
      if (!modelId) throw new Error('no model id');
      const res = await fetch(`/api/models/${modelId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      });
      if (!res.ok) {
        let msg = 'Failed to add image';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    [modelId],
  );

  const setImagePrimary = useCallback(
    async (imageId: string) => {
      if (!modelId) throw new Error('no model id');
      const res = await fetch(`/api/models/${modelId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) {
        let msg = 'Failed to set primary';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    [modelId],
  );

  const deleteImage = useCallback(
    async (imageId: string) => {
      if (!modelId) throw new Error('no model id');
      const res = await fetch(`/api/models/${modelId}/images/${imageId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        let msg = 'Failed to delete image';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
    },
    [modelId],
  );

  const replaceAccountMappings = useCallback(
    async (accounts: Array<{ lateAccountId: string; platform: string; apiKeyIndex?: number }>) => {
      if (!modelId) throw new Error('no model id');
      const res = await fetch(`/api/models/${modelId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (!res.ok) {
        let msg = 'Failed to update accounts';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    [modelId],
  );

  const deleteModel = useCallback(async () => {
    if (!modelId) throw new Error('no model id');
    const res = await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
    if (!res.ok) {
      let msg = 'Failed to delete model';
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
  }, [modelId]);

  return {
    // data
    accountMappings,
    allAccounts,
    generatedImages,
    isLoadingAccounts,
    isLoadingGeneratedImages,
    // mutations
    patchModel,
    uploadImage,
    addImageFromUrl,
    setImagePrimary,
    deleteImage,
    replaceAccountMappings,
    deleteModel,
  };
}
