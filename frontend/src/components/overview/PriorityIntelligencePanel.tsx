import { Link } from 'react-router-dom';
import { Card } from '../Card';
import { StatusBadge } from '../StatusBadge';
import { EvidenceProjectionChart } from './EvidenceProjectionChart';
import type { Insight, Tree } from '../../data/types';

const confidenceLabel: Record<NonNullable<Insight['confidence']>['level'], string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

// The dominant element on Overview (spec 6.2): status, headline, evidence
// chart, and a Detected/Correlated/Recommended row so a non-trivial
// conclusion never rests on prose alone. Only renders real actions —
// "Compare with X" is omitted entirely when no same-species sibling
// exists, rather than showing a control with nothing behind it.
export function PriorityIntelligencePanel({
  insight,
  tree,
  sibling,
  eyebrowLabel = 'Priority signal',
}: {
  insight: Insight;
  tree: Tree;
  sibling?: Tree;
  eyebrowLabel?: string;
}) {
  const timeAgo = Math.round((Date.now() - new Date(insight.ts).getTime()) / 60000);

  return (
    <Card style={{ borderColor: 'var(--insight)', borderWidth: 1.5, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--insight)' }}>
          {eyebrowLabel}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {insight.confidence && (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }} title={insight.confidence.rationale}>
              {confidenceLabel[insight.confidence.level]}
            </span>
          )}
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            updated {timeAgo < 1 ? 'now' : `${timeAgo}m ago`}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <StatusBadge status={insight.status} size="sm" />
        <h2 style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{insight.headline ?? insight.title}</h2>
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 16, lineHeight: 1.5 }}>
        {insight.evidence} {insight.implication}
      </p>

      {insight.evidenceSeries && insight.evidenceSeries.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <EvidenceProjectionChart
            data={insight.evidenceSeries}
            unit={insight.detection?.unit}
            thresholdValue={insight.thresholdValue}
            thresholdLabel={insight.thresholdLabel}
            color="var(--insight)"
          />
        </div>
      )}

      <div className="rgrid-3" style={{ gap: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <EvidenceField
          label="Detected"
          value={insight.detection ? `${insight.detection.metric} ${insight.detection.currentValue}${insight.detection.unit}${insight.detection.changeWindow ? ` (${insight.detection.changeWindow})` : ''}` : insight.evidence}
        />
        {insight.driver ? (
          <EvidenceField label={insight.driver.relationship === 'confirmed' ? 'Confirmed' : 'Correlated'} value={insight.driver.label} />
        ) : (
          <EvidenceField label="Correlated" value="No driver identified" />
        )}
        <EvidenceField label="Recommended" value={insight.action ?? 'No action needed'} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <Link to={`/trees/${tree.id}`} style={{ fontSize: 13, color: 'var(--insight)', fontWeight: 500 }}>
          Review evidence →
        </Link>
        {sibling && (
          <Link to={`/trees/compare/${tree.id}/${sibling.id}`} style={{ fontSize: 13, color: 'var(--insight)', fontWeight: 500 }}>
            Compare with {sibling.name} →
          </Link>
        )}
      </div>
    </Card>
  );
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}
