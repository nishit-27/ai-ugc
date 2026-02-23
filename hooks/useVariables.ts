'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type CustomVariable = {
  id: string;
  name: string;
  type: 'boolean' | 'categorical' | 'numeric';
  options: string[] | null;
  color: string | null;
  created_at: string;
};

export function useVariables() {
  const [variables, setVariables] = useState<CustomVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const loadVariables = useCallback(async () => {
    try {
      const res = await fetch('/api/variables');
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) setVariables(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadVariables();
    return () => { mountedRef.current = false; };
  }, [loadVariables]);

  const createVariable = useCallback(async (data: { name: string; type: string; options?: string[]; color?: string }) => {
    const res = await fetch('/api/variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create variable');
    }
    const variable = await res.json();
    setVariables(prev => [...prev, variable]);
    return variable;
  }, []);

  const updateVariable = useCallback(async (id: string, data: { name?: string; type?: string; options?: string[]; color?: string }) => {
    const res = await fetch(`/api/variables/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update variable');
    }
    const variable = await res.json();
    setVariables(prev => prev.map(v => v.id === id ? variable : v));
    return variable;
  }, []);

  const deleteVariable = useCallback(async (id: string) => {
    setVariables(prev => prev.filter(v => v.id !== id));
    try {
      await fetch(`/api/variables/${id}`, { method: 'DELETE' });
    } catch {
      await loadVariables();
    }
  }, [loadVariables]);

  return { variables, loading, createVariable, updateVariable, deleteVariable, reload: loadVariables };
}
