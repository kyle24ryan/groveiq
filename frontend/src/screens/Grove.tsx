import { TreeCard } from '../components/TreeCard';
import { InsightPanel } from '../components/InsightPanel';
import { Card } from '../components/Card';
import { trees, allInsights, currentConditions, waterDemandNow } from '../data/mockData';
import type { Status } from '../data/types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Grove() {
  const insights = allInsights();
  const counts = {
    urgent: insights.filter((i) => i.status === 'urgent').length,
    watch: insights.filter((i) => i.status === 'watch').length,
    ok: insights.filter((i) => i.status === 'ok').length,
  };
  const needsAttention = counts.urgent + counts.watch;
  const priorityInsight = insights[0];
  const priorityTree = trees.find((t) => t.id === priorityInsight.treeId);
  const demand = waterDemandNow();
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
          <span className="mono" style={{ color: 'var(--ink-faint)', marginLeft: 8, fontSize: 12 }}>
            Updated just now
          </span>
        </p>
      </div>

      <div
        className="mono"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 13,
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 16px',
        }}
      >
        <span>{trees.length} trees</span>
        <Divider />
        <span className="status-ok">{counts.ok} healthy</span>
        <Divider />
        <span className="status-watch">{counts.watch} watch</span>
        <Divider />
        <span className="status-urgent">{counts.urgent} attention</span>
        <Divider />
        <span>{currentConditions.outdoorTempC}°C</span>
        <Divider />
        <span>{currentConditions.humidityPct}% RH</span>
        <Divider />
        <span>PM2.5 {currentConditions.pm25}</span>
        <Divider />
        <span>{currentConditions.rainIn === 0 ? 'No rain' : `${currentConditions.rainIn}in rain`}</span>
      </div>

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
        </p>
      </Card>
    </div>
  );
}

function Divider() {
  return <span style={{ color: 'var(--border-strong)' }}>·</span>;
}
