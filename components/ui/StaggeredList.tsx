'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function StaggeredList({
  children,
  className = '',
  itemSelector = ':scope > *',
  stagger = 0.04,
  duration = 0.35,
}: {
  children: ReactNode;
  className?: string;
  itemSelector?: string;
  stagger?: number;
  duration?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const items = containerRef.current?.querySelectorAll(itemSelector);
    if (!items?.length) return;

    gsap.fromTo(
      items,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration, stagger, ease: 'power2.out' }
    );
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
