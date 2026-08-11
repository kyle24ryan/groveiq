import type { Status } from '../data/types';

const labels: Record<Status, string> = {
  ok: 'Healthy',
  watch: 'Watch',
  urgent: 'Attention',
};

export function StatusBadge({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`status-${status}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: size === 'sm' ? 12 : 13, fontWeight: 500 }}
    >
      <span className={`status-dot status-${status}`} aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
