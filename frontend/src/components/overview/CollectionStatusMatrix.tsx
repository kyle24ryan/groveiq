import { useNavigate, Link } from 'react-router-dom';
import { Card } from '../Card';
import { StatusBadge } from '../StatusBadge';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../../lib/units';
import type { Tree, Insight } from '../../data/types';
import type { RealTreeAnalysis } from '../../data/realTreeAnalysis';

type CollectionStatusMatrixProps = {
  trees: Tree[];
  analyses: Record<string, RealTreeAnalysis>;
  insightByTreeId: Record<string, Insight>;
};

// A dense comparison table replacing the repeated healthy-tree cards on
// Overview (spec 6.5) — one row per tree, ordered worst-first, with only
// the specific out-of-range cell highlighted rather than the whole row.
// `analyses`/`insightByTreeId` are passed in (shared with every other
// screen via useTreeInsights) rather than recomputed here -- this
// component previously called analyzeTree()/insightFor() directly, its
// own independent computation that could disagree with what the rest of
// the app was showing for the same tree.
export function CollectionStatusMatrix({ trees, analyses, insightByTreeId }: CollectionStatusMatrixProps) {
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
              const a = analyses[tree.id];
              const insight = insightByTreeId[tree.id];
              if (!a || !insight) return null;
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
                    {a.hasCurrentReading ? `${a.latest.soilMoistureAvg}%` : '—'}
                  </td>
                  <td className={`mono ${a.decliningFast ? `status-${a.status}` : ''}`} style={{ padding: '10px 12px' }}>
                    {a.hasCurrentReading ? `${a.changePct > 0 ? '↑' : '↓'} ${Math.abs(a.changePct)}%` : '—'}
                  </td>
                  <td className="mono" style={{ padding: '10px 12px' }}>
                    {a.hasCurrentReading ? a.latest.soilEcAvg : '—'}
                  </td>
                  <td className="mono" style={{ padding: '10px 12px' }}>
                    {a.hasCurrentReading ? `${formatTemp(a.latest.soilTempAvg, system)}${tempUnit(system)}` : '—'}
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
