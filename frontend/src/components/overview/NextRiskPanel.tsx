import { Card } from '../Card';
import { analyzeTree } from '../../data/mockData';
import type { Tree, Insight } from '../../data/types';
import type { ForecastDay, RegionalAqi } from '../../lib/api';

type NextRiskPanelProps = {
  trees: Tree[];
  priorityInsight: Insight;
  priorityTreeName?: string;
  demandLabel: string;
  forecast: ForecastDay[];
  regionalAqi: RegionalAqi | null;
};

// Up to four time-indexed items (spec 6.6) — never padded with neutral
// forecast facts just to fill the panel, so an item is omitted rather than
// invented when there's genuinely nothing to say.
export function NextRiskPanel({ trees, priorityInsight, priorityTreeName, demandLabel, forecast, regionalAqi }: NextRiskPanelProps) {
  const items: { label: string; value: string }[] = [];

  if (priorityInsight.status !== 'ok' && priorityInsight.action) {
    items.push({ label: 'Next check', value: `${priorityTreeName ?? 'Priority tree'}: ${priorityInsight.action}` });
  }

  items.push({ label: 'Next 24h', value: `${demandLabel} water demand expected, peak 1-5pm.` });

  const analyses = trees.map((t) => analyzeTree(t.id)).filter((a) => a.daysToThreshold != null);
  analyses.sort((a, b) => (a.daysToThreshold ?? Infinity) - (b.daysToThreshold ?? Infinity));
  if (analyses[0]) {
    const a = analyses[0];
    items.push({ label: 'Threshold crossing', value: `${a.tree.name} reaches its threshold in ~${a.daysToThreshold}d at the current rate.` });
  }

  const frostDay = forecast.find((d) => d.frost_risk === 1);
  const windyDay = forecast.find((d) => d.wind_gust_mph != null && d.wind_gust_mph >= 25);
  if (frostDay) {
    items.push({ label: '7-day risk', value: `Frost risk on ${new Date(`${frostDay.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}.` });
  } else if (windyDay) {
    items.push({ label: '7-day risk', value: `Wind gusts to ${Math.round(windyDay.wind_gust_mph!)}mph forecast ${new Date(`${windyDay.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}.` });
  } else if (regionalAqi?.airnow_category && /unhealthy/i.test(regionalAqi.airnow_category)) {
    items.push({ label: '7-day risk', value: `Regional air quality: ${regionalAqi.airnow_category}.` });
  } else if (forecast.length > 0) {
    items.push({ label: '7-day risk', value: 'No elevated frost, wind, or smoke risk in the forecast.' });
  }

  return (
    <Card>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Next risk
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.slice(0, 4).map((item) => (
          <div key={item.label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
            <span className="eyebrow" style={{ fontSize: 10.5, width: 96, flexShrink: 0, paddingTop: 1 }}>
              {item.label}
            </span>
            <span style={{ color: 'var(--ink-soft)' }}>{item.value}</span>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Nothing to flag right now.</p>}
      </div>
    </Card>
  );
}
