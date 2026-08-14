import { useEffect, useState } from 'react';
import { trees, allInsights, vpdKPa, waterDemandNow } from '../data/mockData';
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

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Centralizes the Overview screen's data: one fetch pass, one priority
// ranking, shared by every overview/* component so none of them can derive
// a conflicting status or pick a different "top" tree (spec 14.3).
export function useGroveOverview() {
  const [latest, setLatest] = useState<ConditionsReading | null>(null);
  const [regionalAqi, setRegionalAqi] = useState<RegionalAqi | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchLatestConditions(), fetchRegionalAqi(), fetchForecast()]).then(([c, aqi, f]) => {
      if (cancelled) return;
      if (c.status === 'fulfilled') setLatest(c.value);
      if (aqi.status === 'fulfilled') setRegionalAqi(aqi.value);
      if (f.status === 'fulfilled') setForecast(f.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const insights = allInsights();
  const counts = {
    urgent: insights.filter((i) => i.status === 'urgent').length,
    watch: insights.filter((i) => i.status === 'watch').length,
    ok: insights.filter((i) => i.status === 'ok').length,
  };
  const needsAttention = counts.urgent + counts.watch;
  const priorityInsight = insights[0];
  const priorityTree = trees.find((t) => t.id === priorityInsight.treeId);
  const vpd = latest?.outdoor_temp_c != null && latest?.humidity_pct != null ? vpdKPa(latest.outdoor_temp_c, latest.humidity_pct) : null;
  const demand = waterDemandNow(vpd ?? undefined);
  const freshness = freshnessLabel(latest?.ts ?? null);
  const sortedTrees = [...trees].sort((a, b) => {
    const aStatus = insights.find((i) => i.treeId === a.id)!.status;
    const bStatus = insights.find((i) => i.treeId === b.id)!.status;
    return rank[aStatus] - rank[bStatus];
  });

  return { loading, latest, regionalAqi, forecast, insights, counts, needsAttention, priorityInsight, priorityTree, vpd, demand, freshness, sortedTrees };
}
