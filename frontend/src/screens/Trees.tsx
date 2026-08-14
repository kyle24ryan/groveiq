import { TreeCard } from '../components/TreeCard';
import { trees, insightFor } from '../data/mockData';
import type { Status } from '../data/types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Worst-first ordering, matching the sidebar and Overview -- this page
// previously showed trees in raw array/insertion order, the one place in
// the app that disagreed with everywhere else about which tree matters
// most right now.
export function Trees() {
  const sorted = [...trees].sort((a, b) => rank[insightFor(a.id).status] - rank[insightFor(b.id).status]);
  const needsAttention = sorted.filter((t) => insightFor(t.id).status !== 'ok').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Trees</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          {trees.length} trees, each a live digital twin
          {needsAttention > 0 ? ` — ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention, shown first.` : ' — all stable.'}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {sorted.map((tree) => (
          <TreeCard key={tree.id} tree={tree} />
        ))}
      </div>
    </div>
  );
}
