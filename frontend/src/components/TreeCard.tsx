import { Link } from 'react-router-dom';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { Sparkline } from './Sparkline';
import { dailyReadingsFor, insightFor, analyzeTree } from '../data/mockData';
import type { Tree } from '../data/types';

const sparklineColor: Record<'ok' | 'watch' | 'urgent', string> = {
  ok: 'var(--ok)',
  watch: 'var(--watch)',
  urgent: 'var(--urgent)',
};

export function TreeCard({ tree }: { tree: Tree }) {
  const readings = dailyReadingsFor(tree.id, 14);
  const insight = insightFor(tree.id);
  // Shares analyzeTree with insightFor/statusFor so the arrow can never
  // disagree with the insight text below it.
  const { latest, changePct } = analyzeTree(tree.id);

  return (
    <Link to={`/trees/${tree.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{tree.name}</div>
            <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--ink-soft)' }}>{speciesToScientific(tree.species)}</div>
          </div>
          <StatusBadge status={insight.status} size="sm" />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">Soil moisture</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {latest.soilMoistureAvg}%
              </span>
              <span className={`status-${changePct < 0 ? 'watch' : 'ok'}`} style={{ fontSize: 12 }}>
                {changePct < 0 ? '↓' : '↑'} {Math.abs(changePct)}%
              </span>
            </div>
          </div>
          <Sparkline values={readings.map((r) => r.soilMoistureAvg)} color={sparklineColor[insight.status]} />
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-soft)' }}>
          <span className="mono">EC {latest.soilEcAvg}</span>
          <span className="mono">{latest.soilTempAvg}°C</span>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {insight.evidence}
        </div>
      </Card>
    </Link>
  );
}

function speciesToScientific(species: string): string {
  const map: Record<string, string> = {
    'Mountain Hemlock': 'Tsuga mertensiana',
    'Alaska Yellow Cedar': 'Callitropsis nootkatensis',
    'Silver Fir': 'Abies sp.',
    'Dawn Redwood': 'Metasequoia glyptostroboides',
  };
  return map[species] ?? species;
}
