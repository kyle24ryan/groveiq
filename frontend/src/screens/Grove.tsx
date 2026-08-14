import { trees } from '../data/mockData';
import { useGroveOverview } from '../hooks/useGroveOverview';
import { AlertBanner } from '../components/AlertBanner';
import { SituationalHeader } from '../components/overview/SituationalHeader';
import { PriorityIntelligencePanel } from '../components/overview/PriorityIntelligencePanel';
import { GroveConditionStrip } from '../components/overview/GroveConditionStrip';
import { CollectionStatusMatrix } from '../components/overview/CollectionStatusMatrix';
import { NextRiskPanel } from '../components/overview/NextRiskPanel';

export function Grove() {
  const { latest, regionalAqi, forecast, counts, needsAttention, priorityInsight, priorityTree, vpd, demand, freshness, sortedTrees } = useGroveOverview();

  const sibling = priorityTree ? trees.find((t) => t.species === priorityTree.species && t.id !== priorityTree.id) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200 }}>
      <SituationalHeader
        urgentCount={counts.urgent}
        watchCount={counts.watch}
        treeCount={trees.length}
        freshnessLabel={freshness.label}
        freshnessStale={freshness.stale}
        hasLiveConditions={latest != null}
      />

      <AlertBanner />

      {needsAttention > 0 && priorityTree && <PriorityIntelligencePanel insight={priorityInsight} tree={priorityTree} sibling={sibling} />}

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Grove conditions
        </div>
        <GroveConditionStrip latest={latest} regionalAqi={regionalAqi} demand={demand} vpd={vpd} freshnessLabel={freshness.label} freshnessStale={freshness.stale} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Collection
          </div>
          <CollectionStatusMatrix trees={sortedTrees} />
        </div>
        <NextRiskPanel
          trees={trees}
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
