'use client';

import { X } from 'lucide-react';
import { useRef, useCallback, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!open || !overlayRef.current || !panelRef.current) return;

    gsap.fromTo(
      overlayRef.current,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.2, ease: 'power2.out' }
    );
    gsap.fromTo(
      panelRef.current,
      { autoAlpha: 0, scale: 0.95, y: 10 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.4)', delay: 0.05 }
    );
  }, { dependencies: [open] });

  const handleClose = useCallback(() => {
    if (!overlayRef.current || !panelRef.current) {
      onClose();
      return;
    }
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(panelRef.current, { autoAlpha: 0, scale: 0.96, y: 8, duration: 0.18, ease: 'power2.in' });
    tl.to(overlayRef.current, { autoAlpha: 0, duration: 0.15, ease: 'power2.in' }, '<0.05');
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ visibility: 'hidden' }}
      onClick={handleClose}
    >
      <div
        ref={panelRef}
        className={`max-h-[96vh] w-full ${maxWidth} mx-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl will-change-transform`}
        style={{ visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
            <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
            <button
              onClick={handleClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
