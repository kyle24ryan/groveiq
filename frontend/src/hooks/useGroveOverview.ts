import { useEffect, useState } from 'react';
import { vpdKPa, waterDemandNow } from '../data/mockData';
import type { Status } from '../data/types';
import {
  fetchLatestConditions,
  fetchRegionalAqi,
  fetchForecast,
  freshnessLabel,
  type ConditionsReading,
  type RegionalAqi,
  type ForecastDay,
} from '../lib/api';
import { useTreeInsights } from './useTreeInsights';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Centralizes the Overview screen's data: one fetch pass, one priority
// ranking, shared by every overview/* component so none of them can derive
// a conflicting status or pick a different "top" tree (spec 14.3).
// Tree-derived data (insights/status) now comes from useTreeInsights()
// (real soil sensor data) instead of mockData.ts's synthetic generator.
export function useGroveOverview() {
  const [latest, setLatest] = useState<ConditionsReading | null>(null);
  const [regionalAqi, setRegionalAqi] = useState<RegionalAqi | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [conditionsLoading, setConditionsLoading] = useState(true);
  const treeInsights = useTreeInsights();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchLatestConditions(), fetchRegionalAqi(), fetchForecast()]).then(([c, aqi, f]) => {
      if (cancelled) return;
      if (c.status === 'fulfilled') setLatest(c.value);
      if (aqi.status === 'fulfilled') setRegionalAqi(aqi.value);
      if (f.status === 'fulfilled') setForecast(f.value);
      setConditionsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { trees, insights, insightByTreeId, analyses } = treeInsights;
  const loading = conditionsLoading || treeInsights.loading;
  const counts = {
    urgent: insights.filter((i) => i.status === 'urgent').length,
    watch: insights.filter((i) => i.status === 'watch').length,
    ok: insights.filter((i) => i.status === 'ok').length,
  };
  const needsAttention = counts.urgent + counts.watch;
  const priorityInsight = insights[0];
  const priorityTree = priorityInsight ? trees.find((t) => t.id === priorityInsight.treeId) : undefined;
  const vpd = latest?.outdoor_temp_c != null && latest?.humidity_pct != null ? vpdKPa(latest.outdoor_temp_c, latest.humidity_pct) : null;
  const demand = waterDemandNow(vpd ?? undefined);
  const freshness = freshnessLabel(latest?.ts ?? null);
  const sortedTrees = [...trees].sort((a, b) => {
    const aStatus = insightByTreeId[a.id]?.status ?? 'ok';
    const bStatus = insightByTreeId[b.id]?.status ?? 'ok';
    return rank[aStatus] - rank[bStatus];
  });
  const treesWithLiveReading = Object.values(analyses).filter((a) => a.hasCurrentReading).length;

  return {
    loading,
    latest,
    regionalAqi,
    forecast,
    insights,
    insightByTreeId,
    analyses,
    counts,
    needsAttention,
    priorityInsight,
    priorityTree,
    vpd,
    demand,
    freshness,
    sortedTrees,
    treesWithLiveReading,
  };
}
