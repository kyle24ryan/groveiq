import { lazy, Suspense } from 'react';
import { Card } from '../Card';
import { useUnits } from '../../contexts/UnitsContext';
import { formatWindSpeed, windSpeedUnit } from '../../lib/units';
import type { Insight, Tree } from '../../data/types';
import type { ConditionsReading } from '../../lib/api';

type SpatialEvidencePanelProps = {
  insight: Insight;
  tree?: Tree;
  latest: ConditionsReading | null;
  freshnessLabel: string;
};

// Mapbox GL JS is ~700KB gzipped -- code-split so it only loads when this
// panel actually renders (spec 18: "lazy-load the native mapping library
// if ... bundle impact is significant"), not bundled into every route.
const GroveMap = lazy(() => import('./GroveMap').then((m) => ({ default: m.GroveMap })));

function compassLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// "Why here, why now?" (spec 6.3): spatial context placed beside the
// priority signal so the map explains the conclusion rather than
// demonstrating a feature on its own. Only shows context relevant to the
// active signal's metric (currently soil moisture -> wind/exposure), not
// every available weather layer.
export function SpatialEvidencePanel({ insight, tree, latest, freshnessLabel }: SpatialEvidencePanelProps) {
  const { system } = useUnits();
  const windDirDeg = latest?.wind_dir_deg ?? null;
  const windMph = latest?.wind_mph ?? null;

  return (
    <Card>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Why here, why now?
      </div>
      <Suspense fallback={<div style={{ height: 260, background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 8 }} />}>
        <GroveMap windDirDeg={windDirDeg} windMph={windMph} />
      </Suspense>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
          <span>Wind</span>
          <span className="mono">{windDirDeg != null ? `${compassLabel(windDirDeg)} (${Math.round(windDirDeg)}°)` : '—'} {windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
          <span>Affected</span>
          <span>{tree ? tree.name : 'Whole grove'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
          <span>Freshness</span>
          <span className="mono">{freshnessLabel}</span>
        </div>
        {insight.driver && (
          <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
            {insight.driver.relationship === 'correlated' ? 'Correlated with' : 'Likely driven by'} {insight.driver.label.toLowerCase()} at the grove's location.
          </p>
        )}
      </div>
    </Card>
  );
}
