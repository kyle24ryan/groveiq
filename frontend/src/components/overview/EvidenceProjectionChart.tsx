import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import type { EvidencePoint } from '../../data/types';

type EvidenceProjectionChartProps = {
  data: EvidencePoint[];
  unit?: string;
  thresholdValue?: number;
  thresholdLabel?: string;
  color?: string;
};

// Observed values render as a solid line, the forward projection as a
// dashed line of the same color — the boundary date carries both fields
// (see mockData.ts's buildEvidenceSeries) so the two segments meet with no
// gap. A threshold reference line marks the tree's own limit when supplied.
// Per spec 6.2/10.3: never let the chart imply a forecast is an observation.
export function EvidenceProjectionChart({ data, unit = '%', thresholdValue, thresholdLabel, color = 'var(--insight)' }: EvidenceProjectionChartProps) {
  const hasProjection = data.some((d) => d.projected !== undefined && d.observed === undefined);

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={36} domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [`${value}${unit}`, name === 'observed' ? 'Observed' : 'Projected']}
          />
          {thresholdValue != null && (
            <ReferenceLine
              y={thresholdValue}
              stroke="var(--watch)"
              strokeDasharray="3 3"
              label={{ value: thresholdLabel ? `${thresholdLabel} (${thresholdValue}${unit})` : `${thresholdValue}${unit}`, position: 'insideTopLeft', fill: 'var(--watch)', fontSize: 10 }}
            />
          )}
          <Line type="monotone" dataKey="observed" stroke={color} strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="projected" stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
        <span>
          <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px solid ${color}`, verticalAlign: 'middle', marginRight: 4 }} />
          Observed
        </span>
        {hasProjection && (
          <span>
            <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${color}`, verticalAlign: 'middle', marginRight: 4 }} />
            Projected at current rate
          </span>
        )}
        {thresholdValue != null && (
          <span>
            <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed var(--watch)', verticalAlign: 'middle', marginRight: 4 }} />
            {thresholdLabel ?? 'Threshold'}
          </span>
        )}
      </div>
    </div>
  );
}
