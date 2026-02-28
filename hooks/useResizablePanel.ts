'use client';

import { useState, useCallback, useRef } from 'react';

type UseResizablePanelOptions = {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction: 'horizontal' | 'vertical'; // horizontal = left/right, vertical = top/bottom
};

export function useResizablePanel({
  initialSize,
  minSize,
  maxSize,
  direction,
}: UseResizablePanelOptions) {
  const [size, setSize] = useState(initialSize);
  const draggingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, invertDirection = false) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
      startSizeRef.current = size;

      const target = e.currentTarget;

      const onPointerMove = (ev: Event) => {
        if (!draggingRef.current) return;
        const pe = ev as PointerEvent;
        const pos = direction === 'horizontal' ? pe.clientX : pe.clientY;
        const delta = pos - startPosRef.current;
        const newSize = startSizeRef.current + (invertDirection ? -delta : delta);
        setSize(Math.max(minSize, Math.min(maxSize, newSize)));
      };

      const onPointerUp = () => {
        draggingRef.current = false;
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
    },
    [size, minSize, maxSize, direction],
  );

  return { size, setSize, onPointerDown };
}
