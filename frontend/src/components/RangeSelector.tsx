import type { TrendRange } from '../data/types';

const OPTIONS: { value: TrendRange; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export function RangeSelector({ value, onChange }: { value: TrendRange; onChange: (range: TrendRange) => void }) {
  return (
    <div role="group" aria-label="Chart time range" style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 999 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            padding: '4px 10px',
            borderRadius: 999,
            border: 'none',
            background: value === opt.value ? 'var(--ink)' : 'transparent',
            color: value === opt.value ? 'var(--canvas)' : 'var(--ink-soft)',
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
