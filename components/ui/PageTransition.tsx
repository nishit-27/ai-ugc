'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function PageTransition({ children, className = '' }: { children: ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        normal: '(prefers-reduced-motion: no-preference)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { reduced } = context.conditions!;
        // Use opacity only (no transform) to avoid breaking position:fixed in child modals
        gsap.fromTo(
          containerRef.current,
          { opacity: 0 },
          {
            opacity: 1,
            duration: reduced ? 0 : 0.35,
            ease: 'power2.out',
            onStart() { if (containerRef.current) containerRef.current.style.visibility = 'visible'; },
          }
        );
      }
    );
    return () => mm.revert();
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className={className} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  );
}
