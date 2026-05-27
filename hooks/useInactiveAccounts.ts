'use client';

import { useEffect, useState } from 'react';

export type InactiveAccount = {
  modelId: string;
  platform: string;
  username?: string;
};

// Fetch once on mount. Cancels the fetch if the component unmounts before
// it resolves. Callers typically transform the flat list into a grouped map.
export function useInactiveAccounts() {
  const [accounts, setAccounts] = useState<InactiveAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models/inactive-accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAccounts(Array.isArray(data.inactiveAccounts) ? data.inactiveAccounts : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, isLoading };
}
