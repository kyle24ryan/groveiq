import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { MetricValue } from '../components/MetricValue';
import { RangeSelector } from '../components/RangeSelector';
import { speciesReference } from '../data/mockData';
import type { TrendRange } from '../data/types';
import { useTreeInsights } from '../hooks/useTreeInsights';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';
import { HOUR_RANGE_WINDOW_HOURS, daysForRange, formatXForRange, emptyMessageForRange } from '../lib/trendRange';
import { fetchSoilReadings, fetchDailyReadings } from '../lib/api';

// Real same-species comparison workflow (spec 6.2's "[Compare with Cedar
// #1]" action) rather than the earlier stand-in that just linked to the
// sibling's own detail page. Only reachable from a Compare link that
// already confirmed both trees exist and share a species, so no
// species-mismatch guard is needed here. Analysis/readings come from the
// same shared useTreeInsights() every other screen reads, so this can't
// disagree with Trees/Tree Detail about either tree's current state.
type CompareRow = { x: string; moisturePct: number | null };

export function TreeCompare() {
  const { system } = useUnits();
  const { idA, idB } = useParams<{ idA: string; idB: string }>();
  const { loading, trees, analyses } = useTreeInsights();
  const treeA = trees.find((t) => t.id === idA);
  const treeB = trees.find((t) => t.id === idB);

  const [chartRange, setChartRange] = useState<TrendRange>('week');
  const [rowsA, setRowsA] = useState<CompareRow[]>([]);
  const [rowsB, setRowsB] = useState<CompareRow[]>([]);

  // Own dedicated fetch, independent of useTreeInsights' shared daily
  // fetch, same reasoning as TreeDetail's chart section: this needs a
  // range-driven window for two specific trees, not the fixed window every
  // other screen's analysis engine needs.
  useEffect(() => {
    if (!idA || !idB) return;
    let cancelled = false;
    async function loadOne(treeId: string): Promise<CompareRow[]> {
      if (chartRange === 'hour') {
        const rows = await fetchSoilReadings(treeId, HOUR_RANGE_WINDOW_HOURS);
        return rows.map((r) => ({ x: r.ts, moisturePct: r.soil_moisture_pct }));
      }
      const rows = await fetchDailyReadings(treeId, daysForRange(chartRange));
      return rows.map((r) => ({ x: r.date, moisturePct: r.soil_moisture_avg }));
    }
    Promise.all([loadOne(idA), loadOne(idB)])
      .then(([a, b]) => {
        if (cancelled) return;
        setRowsA(a);
        setRowsB(b);
      })
      .catch(() => {
        if (!cancelled) {
          setRowsA([]);
          setRowsB([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [idA, idB, chartRange]);

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
  // Index-aligned merge assumes both trees rolled up on the same
  // dates/cron ticks, true in practice since both come off the same
  // shared cron -- a tree missing an isolated tick just leaves a gap
  // (Recharts connectNulls handles it) rather than misaligning the rest.
  const merged = rowsA.map((r, i) => ({ x: r.x, [treeA.name]: r.moisturePct, [treeB.name]: rowsB[i]?.moisturePct }));
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div className="eyebrow">Soil moisture</div>
          <RangeSelector value={chartRange} onChange={setChartRange} />
        </div>
        {(() => {
          const valuesA = rowsA.map((r) => r.moisturePct).filter((v): v is number => v != null);
          const valuesB = rowsB.map((r) => r.moisturePct).filter((v): v is number => v != null);
          if (valuesA.length === 0 && valuesB.length === 0) {
            return <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{emptyMessageForRange(chartRange)}</p>;
          }
          return (
            <>
              <span className="sr-only">
                {`${treeA.name} soil moisture ranged from ${Math.min(...valuesA)}% to ${Math.max(...valuesA)}% over this range, currently ${a.latest.soilMoistureAvg}%. ${treeB.name} ranged from ${Math.min(...valuesB)}% to ${Math.max(...valuesB)}%, currently ${b.latest.soilMoistureAvg}%.`}
              </span>
              <ResponsiveContainer width="100%" height={220} aria-hidden="true">
                <LineChart data={merged}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={formatXForRange(chartRange)} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} unit="%" />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey={treeA.name} stroke="var(--insight)" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey={treeB.name} stroke="var(--ok)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </>
          );
        })()}
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
