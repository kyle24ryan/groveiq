import { InfoTooltip } from './InfoTooltip';

type MetricValueProps = {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaTone?: 'ok' | 'watch' | 'urgent' | 'neutral';
  tooltip?: string;
};

export function MetricValue({ label, value, unit, delta, deltaTone = 'neutral', tooltip }: MetricValueProps) {
  return (
    <div>
      <div className="eyebrow">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
          {value}
        </span>
        {unit && (
          <span className="mono" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div className={`status-${deltaTone}`} style={{ fontSize: 12, marginTop: 2 }}>
          {delta}
        </div>
      )}
    </div>
  );
}
