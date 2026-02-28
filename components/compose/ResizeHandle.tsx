'use client';

type ResizeHandleProps = {
  direction: 'horizontal' | 'vertical';
  onPointerDown: (e: React.PointerEvent) => void;
};

export default function ResizeHandle({ direction, onPointerDown }: ResizeHandleProps) {
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      onPointerDown={onPointerDown}
      className={`group relative flex shrink-0 items-center justify-center transition-colors hover:bg-[var(--accent)] ${
        isHorizontal
          ? 'w-2 cursor-col-resize'
          : 'h-2 cursor-row-resize'
      }`}
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      {/* Visible handle indicator */}
      <div
        className={`rounded-full bg-[var(--border)] transition-all group-hover:bg-[var(--primary)] group-active:bg-[var(--primary)] ${
          isHorizontal
            ? 'h-10 w-[3px] group-hover:h-12 group-active:h-14'
            : 'h-[3px] w-10 group-hover:w-12 group-active:w-14'
        }`}
      />
    </div>
  );
}
