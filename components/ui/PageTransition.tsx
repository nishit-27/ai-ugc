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
        gsap.fromTo(
          containerRef.current,
          { autoAlpha: 0, y: reduced ? 0 : 12 },
          { autoAlpha: 1, y: 0, duration: reduced ? 0 : 0.4, ease: 'power2.out' }
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
