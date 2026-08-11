import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DailyReading } from '../data/types';
import { Card } from './Card';

type ReadingChartProps = {
  title: string;
  data: DailyReading[];
  dataKey: keyof DailyReading;
  color: string;
  unit?: string;
};

export function ReadingChart({ title, data, dataKey, color, unit }: ReadingChartProps) {
  const gradientId = `gradient-${String(dataKey)}`;

  return (
    <Card>
      <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} />
          <Tooltip
            contentStyle={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value) => [unit ? `${value}${unit}` : value, title]}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
