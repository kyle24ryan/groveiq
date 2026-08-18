import { useGroveOverview } from '../hooks/useGroveOverview';
import { AlertBanner } from '../components/AlertBanner';
import { SituationalHeader } from '../components/overview/SituationalHeader';
import { PriorityIntelligencePanel } from '../components/overview/PriorityIntelligencePanel';
import { GroveConditionStrip } from '../components/overview/GroveConditionStrip';
import { CollectionStatusMatrix } from '../components/overview/CollectionStatusMatrix';
import { NextRiskPanel } from '../components/overview/NextRiskPanel';
import { EnvironmentalContextPanel } from '../components/environment-map/EnvironmentalContextPanel';

export function Grove() {
  const {
    latest,
    regionalAqi,
    forecast,
    counts,
    needsAttention,
    priorityInsight,
    priorityTree,
    vpd,
    demand,
    freshness,
    sortedTrees,
    analyses,
    insightByTreeId,
    treesWithLiveReading,
  } = useGroveOverview();

  const sibling = priorityTree ? sortedTrees.find((t) => t.species === priorityTree.species && t.id !== priorityTree.id) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200 }}>
      <SituationalHeader
        urgentCount={counts.urgent}
        watchCount={counts.watch}
        treeCount={sortedTrees.length}
        freshnessLabel={freshness.label}
        freshnessStale={freshness.stale}
        hasLiveConditions={latest != null}
        treesWithLiveReading={treesWithLiveReading}
      />

      <AlertBanner />

      {/* Environmental context is decoupled from needsAttention (demo tree
          status) -- it's always shown, since it's a real live-data map,
          not a claim about a specific tree. The priority panel next to it
          IS tree-specific and stays conditional. */}
      <div className="rgrid-sidebar" style={{ gap: 16, alignItems: 'start' }}>
        {needsAttention > 0 && priorityTree ? (
          <PriorityIntelligencePanel insight={priorityInsight} tree={priorityTree} sibling={sibling} />
        ) : (
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Priority signal
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>All trees are stable right now.</p>
          </div>
        )}
        <EnvironmentalContextPanel latest={latest} regionalAqi={regionalAqi} forecast={forecast} freshnessLabel={freshness.label} compact />
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Grove conditions
        </div>
        <GroveConditionStrip latest={latest} regionalAqi={regionalAqi} demand={demand} vpd={vpd} freshnessLabel={freshness.label} freshnessStale={freshness.stale} />
      </div>

      <div className="rgrid-sidebar" style={{ gap: 16, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Collection
          </div>
          <CollectionStatusMatrix trees={sortedTrees} analyses={analyses} insightByTreeId={insightByTreeId} />
        </div>
        <NextRiskPanel
          analyses={Object.values(analyses)}
          priorityInsight={priorityInsight}
          priorityTreeName={priorityTree?.name}
          demandLabel={demand.label}
          forecast={forecast}
          regionalAqi={regionalAqi}
        />
      </div>
    </div>
  );
}
