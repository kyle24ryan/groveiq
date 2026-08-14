type SituationalHeaderProps = {
  urgentCount: number;
  watchCount: number;
  treeCount: number;
  freshnessLabel: string;
  freshnessStale: boolean;
  hasLiveConditions: boolean;
};

// Replaces the old "Good morning/afternoon" greeting with a stated
// conclusion (spec 6.1) — the first thing a user reads should answer
// "does anything need attention," not tell them what time it is.
function conclusion(urgentCount: number, watchCount: number): string {
  if (urgentCount > 0) {
    const total = urgentCount + watchCount;
    return total === 1 ? 'One tree needs attention' : `${total} conditions require action today`;
  }
  if (watchCount > 0) {
    return watchCount === 1 ? 'One tree needs a closer look' : `${watchCount} trees need a closer look`;
  }
  return 'Your grove is stable';
}

export function SituationalHeader({ urgentCount, watchCount, treeCount, freshnessLabel, freshnessStale, hasLiveConditions }: SituationalHeaderProps) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        North Bend, WA · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <h1 style={{ fontSize: 26 }}>{conclusion(urgentCount, watchCount)}</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>
          GroveIQ is interpreting live weather, air-quality, and forecast signals across {treeCount} trees.
        </span>
        <span className={`mono status-${hasLiveConditions ? (freshnessStale ? 'watch' : 'ok') : 'watch'}`} style={{ fontSize: 12 }}>
          {hasLiveConditions ? freshnessLabel : 'No live data'}
        </span>
        <span className="mono" style={{ color: 'var(--watch)', fontSize: 12 }}>
          Tree readings: demo data
        </span>
      </p>
    </div>
  );
}
