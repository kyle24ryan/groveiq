import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { MetricValue } from '../components/MetricValue';
import { speciesReference } from '../data/mockData';
import { useTreeInsights } from '../hooks/useTreeInsights';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';

// Real same-species comparison workflow (spec 6.2's "[Compare with Cedar
// #1]" action) rather than the earlier stand-in that just linked to the
// sibling's own detail page. Only reachable from a Compare link that
// already confirmed both trees exist and share a species, so no
// species-mismatch guard is needed here. Analysis/readings come from the
// same shared useTreeInsights() every other screen reads, so this can't
// disagree with Trees/Tree Detail about either tree's current state.
export function TreeCompare() {
  const { system } = useUnits();
  const { idA, idB } = useParams<{ idA: string; idB: string }>();
  const { loading, trees, analyses, dailyReadingsByTree } = useTreeInsights();
  const treeA = trees.find((t) => t.id === idA);
  const treeB = trees.find((t) => t.id === idB);

  if (loading) {
    return <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Loading…</p>;
  }

  if (!treeA || !treeB) {
    return (
      <div>
        <p>One or both trees not found.</p>
        <Link to="/trees">Back to Trees</Link>
      </div>
    );
  }

  const a = analyses[treeA.id];
  const b = analyses[treeB.id];
  if (!a || !b) {
    return <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Loading…</p>;
  }
  const readingsA = (dailyReadingsByTree[treeA.id] ?? []).slice(-14);
  const readingsB = (dailyReadingsByTree[treeB.id] ?? []).slice(-14);
  const merged = readingsA.map((r, i) => ({ date: r.date, [treeA.name]: r.soilMoistureAvg, [treeB.name]: readingsB[i]?.soilMoistureAvg }));
  const species = speciesReference.find((s) => s.species === treeA.species);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <div>
        <Link to={`/trees/${treeA.id}`} style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          ← {treeA.name}
        </Link>
        <h1 style={{ fontSize: 24, marginTop: 8 }}>
          {treeA.name} vs {treeB.name}
        </h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          Both {treeA.species} — comparative signals are more reliable between same-species trees sharing conditions.
        </p>
      </div>

      <div className="rgrid-2" style={{ gap: 16 }}>
        {[
          { tree: treeA, a: a },
          { tree: treeB, a: b },
        ].map(({ tree, a: analysis }) => (
          <Card key={tree.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <Link to={`/trees/${tree.id}`} style={{ fontSize: 15, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                  {tree.name}
                </Link>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>{tree.developmentStage}</div>
              </div>
              <StatusBadge status={analysis.status} size="sm" />
            </div>
            <div className="rgrid-2" style={{ gap: 14 }}>
              {analysis.hasCurrentReading ? (
                <>
                  <MetricValue label="Soil moisture" value={analysis.latest.soilMoistureAvg} unit="%" delta={`${analysis.changePct > 0 ? '↑' : '↓'} ${Math.abs(analysis.changePct)}%`} deltaTone={analysis.decliningFast ? 'watch' : 'ok'} />
                  <MetricValue label="EC" value={analysis.latest.soilEcAvg} unit="mS/cm" />
                  <MetricValue label="Soil temp" value={formatTemp(analysis.latest.soilTempAvg, system)} unit={tempUnit(system)} />
                </>
              ) : (
                <>
                  <MetricValue label="Soil moisture" value="—" />
                  <MetricValue label="EC" value="—" />
                  <MetricValue label="Soil temp" value="—" />
                </>
              )}
              <MetricValue label="Moisture range" value={`${tree.soilMoistureThresholdLow}-${tree.soilMoistureThresholdHigh}`} unit="%" />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Soil moisture — last 14 days
        </div>
        {readingsA.length === 0 && readingsB.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Not enough daily history yet for a trend comparison — real soil sensors went live 2026-08-18, and daily rollups are written once a day.
          </p>
        ) : (
          <>
            <span className="sr-only">
              {`${treeA.name} soil moisture ranged from ${Math.min(...readingsA.map((r) => r.soilMoistureAvg))}% to ${Math.max(...readingsA.map((r) => r.soilMoistureAvg))}% over the last 14 days, currently ${a.latest.soilMoistureAvg}%. ${treeB.name} ranged from ${Math.min(...readingsB.map((r) => r.soilMoistureAvg))}% to ${Math.max(...readingsB.map((r) => r.soilMoistureAvg))}%, currently ${b.latest.soilMoistureAvg}%.`}
            </span>
            <ResponsiveContainer width="100%" height={220} aria-hidden="true">
              <LineChart data={merged}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} unit="%" />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey={treeA.name} stroke="var(--insight)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={treeB.name} stroke="var(--ok)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {species && (
        <Card style={{ borderColor: 'var(--insight)' }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--insight)' }}>
            Species context
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{species.aiNotes}</p>
        </Card>
      )}
    </div>
  );
}
