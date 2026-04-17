'use client';

export function BarsLoader({
  size = 16,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const barWidth = Math.max(1.5, size * 0.14);
  const barHeight = size;
  const gap = Math.max(1, size * 0.12);
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-flex items-end ${className}`}
      style={{ height: size, gap }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="bars-loader-bar"
          style={{
            width: barWidth,
            height: barHeight,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
      <style jsx>{`
        .bars-loader-bar {
          display: inline-block;
          background: currentColor;
          border-radius: 2px;
          transform-origin: bottom;
          animation: bars-loader-scale 0.9s ease-in-out infinite;
        }
        @keyframes bars-loader-scale {
          0%,
          40%,
          100% {
            transform: scaleY(0.35);
            opacity: 0.5;
          }
          20% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}
