'use client';

export function RunableLogo({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-label="Runable"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-lg text-white shadow-sm"
      style={{
        width: size,
        height: size,
        background:
          'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover, #c4507a) 100%)',
        fontFamily: 'var(--font-brand)',
        fontSize: Math.floor(size * 0.55),
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}
    >
      R
    </span>
  );
}
