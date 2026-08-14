import { useEffect, useState } from 'react';
import { TreeCard } from '../components/TreeCard';
import { InsightPanel } from '../components/InsightPanel';
import { Card } from '../components/Card';
import { trees, allInsights, vpdKPa, waterDemandNow } from '../data/mockData';
import { fetchLatestConditions, freshnessLabel, type ConditionsReading } from '../lib/api';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit, formatRain, rainUnit } from '../lib/units';
import { InfoTooltip } from '../components/InfoTooltip';
import { AlertBanner } from '../components/AlertBanner';
import { metricInfo } from '../data/metricInfo';
import type { Status } from '../data/types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Grove() {
  const { system } = useUnits();
  const [latest, setLatest] = useState<ConditionsReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestConditions()
      .then((reading) => {
        if (!cancelled) setLatest(reading);
      })
      .catch(() => {
        // Environment screen surfaces the error prominently; here we just
        // fall through to "—" placeholders rather than duplicate it.
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>{greeting()}</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          {needsAttention === 0
            ? 'Your grove is stable. Nothing needs attention right now.'
            : `Your grove is stable. ${needsAttention} tree${needsAttention !== 1 ? 's' : ''} need${needsAttention === 1 ? 's' : ''} attention.`}
          <span className="mono" style={{ color: 'var(--watch)', marginLeft: 8, fontSize: 12 }}>
            Tree readings: demo data
          </span>
        </p>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {[
            { label: 'Trees', value: trees.length },
            { label: 'Healthy', value: counts.ok, tone: 'ok' as const },
            { label: 'Watch', value: counts.watch, tone: 'watch' as const },
            { label: 'Attention', value: counts.urgent, tone: 'urgent' as const },
          ].map((stat) => (
            <StatCell key={stat.label} {...stat} borderRight />
          ))}
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          {[
            { label: 'Outdoor', value: latest?.outdoor_temp_c != null ? `${formatTemp(latest.outdoor_temp_c, system)}${tempUnit(system)}` : '—' },
            { label: 'Humidity', value: latest?.humidity_pct != null ? `${latest.humidity_pct}%` : '—' },
            { label: 'PM2.5', value: latest?.pm25 ?? '—' },
            { label: 'Rain', value: latest?.rain_in === 0 || latest?.rain_in == null ? 'None' : `${formatRain(latest.rain_in, system)}${rainUnit(system)}` },
          ].map((stat, i, arr) => (
            <StatCell key={stat.label} {...stat} borderRight={i < arr.length - 1} />
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 18px' }}>
            <span className={`status-${freshness.stale ? 'watch' : 'ok'}`} style={{ fontSize: 11 }}>
              {freshness.label}
            </span>
          </div>
        </div>
      </Card>

      <AlertBanner />

      {priorityInsight.status !== 'ok' && <InsightPanel insight={priorityInsight} treeName={priorityTree?.name} />}

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Collection
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {sortedTrees.map((tree) => (
            <TreeCard key={tree.id} tree={tree} />
          ))}
        </div>
      </div>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Next 24-48 hours
        </div>
        <p style={{ fontSize: 13.5 }}>
          {demand.label} water demand right now. No frost or high-wind risk in the current forecast window.
          <InfoTooltip text={metricInfo.waterDemand} />
        </p>
      </Card>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
  borderRight,
}: {
  label: string;
  value: string | number;
  tone?: Status;
  borderRight?: boolean;
}) {
  return (
    <div
      style={{
        flex: '1 1 92px',
        padding: '14px 18px',
        borderRight: borderRight ? '1px solid var(--border)' : 'none',
      }}
    >
      <div className="eyebrow" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className={`mono ${tone ? `status-${tone}` : ''}`} style={{ fontSize: 19, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
