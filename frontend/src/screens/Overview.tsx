import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { GrowthRing } from '../components/GrowthRing';
import { trees, latestAnalysisFor, statusFor } from '../data/mockData';
import type { Status } from '../data/types';

const statusRank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

export function Overview() {
  const cards = trees
    .map((tree) => ({ tree, status: statusFor(tree.id), analysis: latestAnalysisFor(tree.id) }))
    .sort((a, b) => statusRank[a.status] - statusRank[b.status]);

  const needsAttention = cards.filter((c) => c.status !== 'ok');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Overview</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Your grove at a glance.</p>
      </div>

      <Card style={{ background: 'var(--linen)', border: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 6 }}>
          This month
        </div>
        {needsAttention.length === 0 ? (
          <div>Everything's steady — no trees need attention right now.</div>
        ) : (
          <div>
            {needsAttention.map((c) => c.tree.name).join(', ')} {needsAttention.length === 1 ? 'needs' : 'need'} the most attention this month.
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {cards.map(({ tree, status, analysis }) => (
          <Link key={tree.id} to={`/trees/${tree.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GrowthRing size={32} rings={5} color={`var(--${status === 'ok' ? 'moss' : status === 'watch' ? 'amber' : 'brick'})`} />
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>{tree.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{tree.species}</div>
                  </div>
                </div>
              </div>
              <StatusBadge status={status} />
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{analysis.summary}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
