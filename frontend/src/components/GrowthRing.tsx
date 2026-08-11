type GrowthRingProps = {
  rings?: number;
  size?: number;
  spinning?: boolean;
  color?: string;
};

export function GrowthRing({ rings = 5, size = 48, spinning = false, color = 'var(--clay)' }: GrowthRingProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 2;
  const step = maxRadius / rings;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={spinning ? 'growth-ring-spin' : undefined}
      role="img"
      aria-label="loading"
    >
      {Array.from({ length: rings }).map((_, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={step * (i + 1)}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.3 + (i / rings) * 0.5}
        />
      ))}
      <circle cx={center} cy={center} r={1.5} fill={color} />
      <style>{`
        .growth-ring-spin {
          animation: growth-ring-spin 1.4s linear infinite;
        }
        @keyframes growth-ring-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
