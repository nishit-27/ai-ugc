'use client';

// Unique gradient IDs per render avoid collisions when multiple logos mount.
let _gid = 0;
function nextId() {
  _gid = (_gid + 1) % 1_000_000;
  return `gemini-spark-${_gid}`;
}

export function GeminiIcon({
  className = '',
  size,
}: {
  className?: string;
  size?: number | string;
}) {
  const id = nextId();
  const styleProp = size !== undefined ? { width: size, height: size } : undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={styleProp}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f9a8d4" />
          <stop offset="55%" stopColor="#d4698e" />
          <stop offset="100%" stopColor="#c4507a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 0 C12 6 18 12 24 12 C18 12 12 18 12 24 C12 18 6 12 0 12 C6 12 12 6 12 0 Z"
      />
    </svg>
  );
}

export function GeminiLogo({ size = 28 }: { size?: number }) {
  const inner = Math.floor(size * 0.62);
  return (
    <span
      aria-label="Gemini"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-lg bg-[var(--bg-primary)] ring-1 ring-[var(--border)]"
      style={{ width: size, height: size }}
    >
      <GeminiIcon size={inner} className="block" />
    </span>
  );
}
