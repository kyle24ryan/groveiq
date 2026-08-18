import { TreeCard } from '../components/TreeCard';
import { useTreeInsights } from '../hooks/useTreeInsights';
import type { Status } from '../data/types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Worst-first ordering, matching the sidebar and Overview -- this page
// previously showed trees in raw array/insertion order, the one place in
// the app that disagreed with everywhere else about which tree matters
// most right now.
export function Trees() {
  const { loading, trees, insightByTreeId, analyses, dailyReadingsByTree } = useTreeInsights();
  const sorted = [...trees].sort((a, b) => rank[(insightByTreeId[a.id]?.status ?? 'ok')] - rank[(insightByTreeId[b.id]?.status ?? 'ok')]);
  const needsAttention = sorted.filter((t) => (insightByTreeId[t.id]?.status ?? 'ok') !== 'ok').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Trees</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          {trees.length} trees, each a live digital twin
          {loading ? ' — loading current readings…' : needsAttention > 0 ? ` — ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention, shown first.` : ' — all stable.'}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {sorted.map((tree) => {
          const insight = insightByTreeId[tree.id];
          const analysis = analyses[tree.id];
          if (!insight || !analysis) return null;
          return <TreeCard key={tree.id} tree={tree} insight={insight} analysis={analysis} dailyReadings={dailyReadingsByTree[tree.id] ?? []} />;
        })}
      </div>
    </div>
  );
}
