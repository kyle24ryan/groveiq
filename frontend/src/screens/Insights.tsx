import { Link } from 'react-router-dom';
import { PriorityIntelligencePanel } from '../components/overview/PriorityIntelligencePanel';
import { StatusBadge } from '../components/StatusBadge';
import { useTreeInsights } from '../hooks/useTreeInsights';

// The Intelligence surface (spec Phase 5): every active detection gets the
// same dense evidence panel as Overview's single priority signal, sharing
// the same real per-tree insight data (useTreeInsights) as every other
// screen so this can't disagree with the sidebar, Overview, or Tree
// Detail. Stable trees are collapsed to a single low-emphasis row each
// rather than repeating a full panel with nothing to show.
export function Insights() {
  const { loading, trees, insights } = useTreeInsights();
  const active = insights.filter((i) => i.status !== 'ok');
  const stable = insights.filter((i) => i.status === 'ok');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Intelligence</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          Every active detection across the collection, with the evidence and reasoning behind it.
        </p>
      </div>

      {loading ? (
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Loading…</p>
      ) : active.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Nothing needs attention right now — every tree is within its expected range.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {active.map((insight) => {
            const tree = trees.find((t) => t.id === insight.treeId);
            if (!tree) return null;
            const sibling = trees.find((t) => t.species === tree.species && t.id !== tree.id);
            return <PriorityIntelligencePanel key={insight.id} insight={insight} tree={tree} sibling={sibling} eyebrowLabel="Active signal" />;
          })}
        </div>
      )}

      {stable.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Stable
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stable.map((insight) => {
              const tree = trees.find((t) => t.id === insight.treeId);
              if (!tree) return null;
              return (
                <Link
                  key={insight.id}
                  to={`/trees/${tree.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    padding: '10px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--surface)',
                    textDecoration: 'none',
                    color: 'inherit',
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontWeight: 500, flexShrink: 0 }}>{tree.name}</span>
                  <span style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{insight.evidence}</span>
                  <StatusBadge status={insight.status} size="sm" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
