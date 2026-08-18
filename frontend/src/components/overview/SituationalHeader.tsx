type SituationalHeaderProps = {
  urgentCount: number;
  watchCount: number;
  treeCount: number;
  freshnessLabel: string;
  freshnessStale: boolean;
  hasLiveConditions: boolean;
  treesWithLiveReading: number;
};

function treeReadingsLabel(treesWithLiveReading: number, treeCount: number): { text: string; tone: 'ok' | 'watch' } {
  if (treeCount === 0) return { text: 'Tree readings: —', tone: 'watch' };
  if (treesWithLiveReading === treeCount) return { text: 'Tree readings: live', tone: 'ok' };
  if (treesWithLiveReading === 0) return { text: 'Tree readings: no live data yet', tone: 'watch' };
  return { text: `Tree readings: ${treesWithLiveReading} of ${treeCount} live`, tone: 'watch' };
}

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

export function SituationalHeader({ urgentCount, watchCount, treeCount, freshnessLabel, freshnessStale, hasLiveConditions, treesWithLiveReading }: SituationalHeaderProps) {
  const readings = treeReadingsLabel(treesWithLiveReading, treeCount);
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
        <span className={`mono status-${readings.tone}`} style={{ fontSize: 12 }}>
          {readings.text}
        </span>
      </p>
    </div>
  );
}
