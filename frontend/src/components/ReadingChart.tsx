import type { ReactNode } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from './Card';

type ReadingChartProps = {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  xKey: string;
  color: string;
  unit?: string;
  formatX?: (v: string) => string;
  emptyMessage?: string;
  headerRight?: ReactNode;
};

export function ReadingChart({ title, data, dataKey, xKey, color, unit, formatX, emptyMessage, headerRight }: ReadingChartProps) {
  const gradientId = `gradient-${dataKey}-${xKey}`;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div className="eyebrow">{title}</div>
        {headerRight}
      </div>
      {data.length === 0 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', textAlign: 'center' }}>{emptyMessage ?? 'No data for this range yet.'}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={formatX} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [unit ? `${value}${unit}` : value, title]}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.75} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
