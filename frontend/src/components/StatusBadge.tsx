import type { Status } from '../data/types';

const labels: Record<Status, string> = {
  ok: 'OK',
  watch: 'Watch',
  urgent: 'Urgent',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-${status}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      <span className={`status-dot status-${status}`} />
      {labels[status]}
    </span>
  );
}
