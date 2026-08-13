import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const graphIcon = (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 15L7.5 9L11 12L17 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 17V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <path d="M3 17H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
  </svg>
);

// Toggle button meant to sit top-right of a Card, matching the graph-icon
// pattern from the Ecowitt dashboard -- click to reveal an inline 24h
// trend chart for that specific metric, using data the card already has
// (no extra fetch).
export function ChartToggle({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? 'Hide trend chart' : 'Show trend chart'}
      aria-expanded={open}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: open ? 'var(--insight-bg)' : 'transparent',
        color: open ? 'var(--insight)' : 'var(--ink-faint)',
        cursor: 'pointer',
      }}
    >
      {graphIcon}
    </button>
  );
}

export function useChartToggle(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  return { open, toggle: () => setOpen((o) => !o) };
}

type MiniTrendChartProps = {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey: string;
  color: string;
  unit?: string;
  formatX?: (v: string) => string;
};

export function MiniTrendChart({ data, dataKey, xKey, color, unit, formatX }: MiniTrendChartProps) {
  const gradientId = `mini-${dataKey}`;
  return (
    <div style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: 'var(--ink-faint)' }} tickFormatter={formatX} minTickGap={30} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--ink-faint)' }} width={28} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(value) => [unit ? `${value}${unit}` : value, '']}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.5} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

