import { useEffect, useState } from 'react';
import { trees as mockTrees } from '../data/mockData';
import type { Tree, DailyReading, Insight, Status } from '../data/types';
import { fetchAllTreeProfiles, fetchSoilReadings, fetchDailyReadings, type TreeProfile } from '../lib/api';
import { analyzeTreeReal, insightForReal, dailyReadingsFromRows, type RealTreeAnalysis } from '../data/realTreeAnalysis';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Real per-tree thresholds (editable via Settings/Tree Detail, persisted
// to D1) override the mock array's -- everything else about a tree's
// identity comes from the mock seed for now, matching the existing
// "prefer live profile, fall back to mock" pattern already used by Tree
// Detail's own profile fetch. Only the threshold fields actually change
// analysis correctness, so those are the ones worth merging carefully.
function mergeTreeWithProfile(base: Tree, profile: TreeProfile | undefined): Tree {
  if (!profile) return base;
  return {
    ...base,
    soilMoistureThresholdLow: profile.soil_moisture_threshold_low ?? base.soilMoistureThresholdLow,
    soilMoistureThresholdHigh: profile.soil_moisture_threshold_high ?? base.soilMoistureThresholdHigh,
    ecThresholdHigh: profile.ec_threshold_high ?? base.ecThresholdHigh,
    dormancySoilTempC: profile.dormancy_soil_temp_c ?? base.dormancySoilTempC,
  };
}

export type TreeInsights = {
  loading: boolean;
  error: string | null;
  trees: Tree[];
  analyses: Record<string, RealTreeAnalysis>;
  insights: Insight[]; // sorted worst-first, matches allInsights()'s contract
  insightByTreeId: Record<string, Insight>;
  dailyReadingsByTree: Record<string, DailyReading[]>;
};

// Real-data replacement for mockData.ts's analyzeTree()/insightFor()/
// allInsights()/dailyReadingsFor(), fetched once and shared -- same
// centralization principle as useGroveOverview.ts, so every screen reads
// the same computed insight for a given tree and can't disagree.
export function useTreeInsights(): TreeInsights {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trees, setTrees] = useState<Tree[]>(mockTrees);
  const [analyses, setAnalyses] = useState<Record<string, RealTreeAnalysis>>({});
  const [insightByTreeId, setInsightByTreeId] = useState<Record<string, Insight>>({});
  const [dailyReadingsByTree, setDailyReadingsByTree] = useState<Record<string, DailyReading[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let profiles: TreeProfile[] = [];
      try {
        profiles = await fetchAllTreeProfiles();
      } catch {
        // Falls back to mock thresholds below -- e.g. local dev without a
        // same-origin API.
      }
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      const mergedTrees = mockTrees.map((t) => mergeTreeWithProfile(t, profileById.get(t.id)));

      const perTree = await Promise.all(
        mergedTrees.map(async (tree) => {
          try {
            const [soilReadings, dailyRows] = await Promise.all([fetchSoilReadings(tree.id, 6), fetchDailyReadings(tree.id, 90)]);
            const latestSoil = soilReadings.length > 0 ? soilReadings[soilReadings.length - 1] : null;
            const dailyHistory = dailyReadingsFromRows(dailyRows);
            const analysis = analyzeTreeReal(tree, latestSoil, dailyHistory);
            const insight = insightForReal(analysis, dailyHistory);
            return { treeId: tree.id, analysis, insight, dailyHistory };
          } catch (err) {
            // One tree's fetch failing shouldn't blank out the other four.
            const analysis = analyzeTreeReal(tree, null, []);
            const insight = insightForReal(analysis, []);
            return { treeId: tree.id, analysis, insight, dailyHistory: [], fetchError: String(err) };
          }
        })
      );

      if (cancelled) return;

      setTrees(mergedTrees);
      setAnalyses(Object.fromEntries(perTree.map((r) => [r.treeId, r.analysis])));
      setInsightByTreeId(Object.fromEntries(perTree.map((r) => [r.treeId, r.insight])));
      setDailyReadingsByTree(Object.fromEntries(perTree.map((r) => [r.treeId, r.dailyHistory])));
      setLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const insights = Object.values(insightByTreeId).sort((a, b) => rank[a.status] - rank[b.status]);

  return { loading, error, trees, analyses, insights, insightByTreeId, dailyReadingsByTree };
}
