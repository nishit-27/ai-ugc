'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useToast } from '@/hooks/useToast';

gsap.registerPlugin(useGSAP);

export default function Toast() {
  const { toast } = useToast();
  const toastRef = useRef<HTMLDivElement>(null);
  const prevToast = useRef(toast);

  useEffect(() => {
    if (!toastRef.current) return;

    // New toast appeared
    if (toast && toast !== prevToast.current) {
      gsap.fromTo(
        toastRef.current,
        { autoAlpha: 0, x: 60, scale: 0.92 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
      );
    }

    prevToast.current = toast;
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      ref={toastRef}
      className={`fixed bottom-8 right-8 z-[2000] rounded-lg px-6 py-3 shadow-lg will-change-transform ${
        toast.type === 'error' ? 'bg-[var(--error)]' : toast.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--primary)]'
      } text-white`}
      style={{ visibility: 'hidden' }}
    >
      {toast.message}
    </div>
  );
}
