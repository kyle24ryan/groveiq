import { useNavigate, Link } from 'react-router-dom';
import { Card } from '../Card';
import { StatusBadge } from '../StatusBadge';
import { analyzeTree, insightFor } from '../../data/mockData';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../../lib/units';
import type { Tree } from '../../data/types';

// A dense comparison table replacing the repeated healthy-tree cards on
// Overview (spec 6.5) — one row per tree, ordered worst-first, with only
// the specific out-of-range cell highlighted rather than the whole row.
// Every value comes from analyzeTree()/insightFor(), the same functions
// behind the sidebar dot and Tree Detail, so this can't disagree with them.
export function CollectionStatusMatrix({ trees }: { trees: Tree[] }) {
  const { system } = useUnits();
  const navigate = useNavigate();

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 16px', fontWeight: 500 }}>Tree</th>
              <th style={{ padding: '10px 12px', fontWeight: 500 }}>Moisture</th>
              <th style={{ padding: '10px 12px', fontWeight: 500 }}>24h Δ</th>
              <th style={{ padding: '10px 12px', fontWeight: 500 }}>EC</th>
              <th style={{ padding: '10px 12px', fontWeight: 500 }}>Soil temp</th>
              <th style={{ padding: '10px 12px', fontWeight: 500 }}>Risk window</th>
              <th style={{ padding: '10px 16px', fontWeight: 500 }}>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {trees.map((tree) => {
              const a = analyzeTree(tree.id);
              const insight = insightFor(tree.id);
              const moistureOut = a.belowThreshold || a.aboveThreshold;
              return (
                <tr
                  key={tree.id}
                  onClick={() => navigate(`/trees/${tree.id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--canvas)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`status-dot status-${a.status}`} aria-hidden="true" />
                      <Link to={`/trees/${tree.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
                        {tree.name}
                      </Link>
                    </div>
                  </td>
                  <td className="mono" style={{ padding: '10px 12px', color: moistureOut ? (a.status === 'urgent' ? 'var(--urgent)' : 'var(--watch)') : undefined }}>
                    {a.latest.soilMoistureAvg}%
                  </td>
                  <td className={`mono ${a.decliningFast ? `status-${a.status}` : ''}`} style={{ padding: '10px 12px' }}>
                    {a.changePct > 0 ? '↑' : '↓'} {Math.abs(a.changePct)}%
                  </td>
                  <td className="mono" style={{ padding: '10px 12px' }}>
                    {a.latest.soilEcAvg}
                  </td>
                  <td className="mono" style={{ padding: '10px 12px' }}>
                    {formatTemp(a.latest.soilTempAvg, system)}{tempUnit(system)}
                  </td>
                  <td className="mono" style={{ padding: '10px 12px', color: a.daysToThreshold != null && a.daysToThreshold < 2 ? 'var(--urgent)' : undefined }}>
                    {a.daysToThreshold != null ? `~${a.daysToThreshold}d` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink-soft)', maxWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={a.status} size="sm" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{insight.headline ?? insight.title}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
