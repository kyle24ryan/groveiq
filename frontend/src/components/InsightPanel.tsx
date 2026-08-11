import type { Insight } from '../data/types';

const badgeColor: Record<Insight['status'], string> = {
  ok: 'var(--insight)',
  watch: 'var(--watch)',
  urgent: 'var(--urgent)',
};

const badgeBg: Record<Insight['status'], string> = {
  ok: 'var(--insight-bg)',
  watch: 'var(--watch-bg)',
  urgent: 'var(--urgent-bg)',
};

export function InsightPanel({ insight, treeName }: { insight: Insight; treeName?: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: badgeColor[insight.status],
            background: badgeBg[insight.status],
            padding: '2px 8px',
            borderRadius: 999,
          }}
        >
          GroveIQ
        </span>
        {treeName && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{treeName}</span>}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600 }}>{insight.title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{insight.evidence}</div>

      {insight.comparison && (
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--ink-soft)' }}>Compared to baseline: </span>
          {insight.comparison}
        </div>
      )}
      {insight.likelyCause && (
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--ink-soft)' }}>Likely cause: </span>
          {insight.likelyCause}
        </div>
      )}
      {insight.implication && (
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--ink-soft)' }}>What's next: </span>
          {insight.implication}
        </div>
      )}
      {insight.action && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            marginTop: 4,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          Suggested action: {insight.action}
        </div>
      )}
    </div>
  );
}
