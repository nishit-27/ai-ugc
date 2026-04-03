'use client';

import { useCallback, useEffect, useRef } from 'react';

type UseUnsavedChangesWarningParams = {
  isDirty: boolean;
  message?: string;
};

function getNavigatingAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;

  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;

  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }

  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return null;

    const current = new URL(window.location.href);
    if (url.pathname === current.pathname && url.search === current.search && url.hash) {
      return null;
    }
  } catch {
    return null;
  }

  return anchor;
}

export function useUnsavedChangesWarning({
  isDirty,
  message = 'Are you sure you want to leave? You have unsaved changes.',
}: UseUnsavedChangesWarningParams) {
  const dirtyRef = useRef(isDirty);
  const bypassRef = useRef(false);
  const historyGuardActiveRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = isDirty;
    if (!isDirty) {
      bypassRef.current = false;
      historyGuardActiveRef.current = false;
    }
  }, [isDirty]);

  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  const confirmNavigation = useCallback(() => {
    if (!dirtyRef.current || bypassRef.current) {
      return true;
    }

    const confirmed = window.confirm(message);
    if (confirmed) {
      bypassRef.current = true;
    }
    return confirmed;
  }, [message]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty || historyGuardActiveRef.current) return;

    window.history.pushState({ __aiUgcUnsavedGuard: true }, '', window.location.href);
    historyGuardActiveRef.current = true;

    const handlePopState = () => {
      if (!dirtyRef.current || bypassRef.current) return;

      if (window.confirm(message)) {
        bypassRef.current = true;
        window.setTimeout(() => window.history.back(), 0);
        return;
      }

      window.history.pushState({ __aiUgcUnsavedGuard: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty, message]);

  useEffect(() => {
    if (!isDirty) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!dirtyRef.current || bypassRef.current) return;

      const anchor = getNavigatingAnchor(event.target);
      if (!anchor) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      bypassRef.current = true;
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [isDirty, message]);

  return {
    allowNextNavigation,
    confirmNavigation,
  };
}
