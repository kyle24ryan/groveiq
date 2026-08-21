import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { milestonesFor } from '../data/mockData';
import { useTreeInsights } from '../hooks/useTreeInsights';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';
import { metricInfo } from '../data/metricInfo';
import { fetchTreeAnalyses, photoUrl, type PhotoAnalysis, type IrrigationEvent } from '../lib/api';
import type { Status, Milestone } from '../data/types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Irrigation event ids come from a different D1 table/sequence than
// milestones, so raw ids could collide as React keys once both are
// rendered in the same marker list -- offset well clear of any real
// milestone id rather than risk that.
const IRRIGATION_MARKER_ID_OFFSET = 900_000_000;

// scheduled/sensor trigger_source both map to the 'manual' visual
// treatment -- the marker system only distinguishes manual vs AI, and
// neither of those is AI-driven.
function irrigationEventsToMilestones(treeId: string, events: IrrigationEvent[]): Milestone[] {
  return events.map((e) => ({
    id: IRRIGATION_MARKER_ID_OFFSET + Number(e.id),
    treeId,
    date: e.ts.slice(0, 10),
    label:
      e.status === 'completed'
        ? `Watered for ${e.actual_duration_sec ?? e.requested_duration_sec}s${e.flow_confirmed ? '' : ' (flow unconfirmed)'}`
        : `Watering aborted — ${(e.aborted_reason ?? 'unknown reason').replace(/_/g, ' ')}`,
    source: e.trigger_source === 'ai' ? 'ai' : 'manual',
  }));
}

export function Timeline() {
  const { system } = useUnits();
  const { loading, trees, insightByTreeId, dailyReadingsByTree, irrigationEventsByTree } = useTreeInsights();
  const [treeId, setTreeId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysis[]>([]);

  // Worst-first ordering, matching the sidebar/Overview convention.
  // Recomputed from real insights, not knowable until they've loaded.
  const sortedTrees = useMemo(
    () => [...trees].sort((a, b) => rank[insightByTreeId[a.id]?.status ?? 'ok'] - rank[insightByTreeId[b.id]?.status ?? 'ok']),
    [trees, insightByTreeId]
  );

  // Default to the worst-off tree once real insights are in -- can't be
  // known synchronously the way the old mock-data version could.
  useEffect(() => {
    if (!loading && !treeId && sortedTrees.length > 0) {
      setTreeId(sortedTrees[0].id);
    }
  }, [loading, treeId, sortedTrees]);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    fetchTreeAnalyses(treeId)
      .then((analyses) => {
        if (!cancelled) setPhotoAnalyses(analyses.filter((a) => a.kind === 'vision' && a.photo_url));
      })
      .catch(() => {
        // Falls back to the "no capture yet" placeholder below.
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const tree = treeId ? trees.find((t) => t.id === treeId) : undefined;
  const readings = treeId ? (dailyReadingsByTree[treeId] ?? []) : [];
  const reading = readings.length > 0 ? readings[Math.min(index, readings.length - 1)] : null;
  const milestones = treeId ? [...milestonesFor(treeId), ...irrigationEventsToMilestones(treeId, irrigationEventsByTree[treeId] ?? [])] : [];

  // Nearest real photo in time to the scrubbed date, matching this page's
  // own "imagery, readings, and events... synchronized" framing -- not
  // just always showing the latest capture regardless of scrub position.
  const nearestPhoto = useMemo(() => {
    if (photoAnalyses.length === 0 || !reading) return null;
    const targetMs = new Date(reading.date).getTime();
    return photoAnalyses.reduce((closest, a) => {
      const aDiff = Math.abs(new Date(a.ts).getTime() - targetMs);
      const closestDiff = Math.abs(new Date(closest.ts).getTime() - targetMs);
      return aDiff < closestDiff ? a : closest;
    });
  }, [photoAnalyses, reading]);

  const moistureInRange = reading && tree ? reading.soilMoistureAvg >= tree.soilMoistureThresholdLow && reading.soilMoistureAvg <= tree.soilMoistureThresholdHigh : true;
  const ecInRange = reading && tree ? reading.soilEcAvg <= tree.ecThresholdHigh : true;

  const rangeStart = readings.length > 0 ? new Date(readings[0].date).getTime() : 0;
  const rangeEnd = readings.length > 0 ? new Date(readings[readings.length - 1].date).getTime() : 0;
  const markers = milestones
    .filter((m) => {
      const t = new Date(m.date).getTime();
      return readings.length > 0 && t >= rangeStart && t <= rangeEnd;
    })
    .map((m) => ({ ...m, pct: rangeEnd > rangeStart ? ((new Date(m.date).getTime() - rangeStart) / (rangeEnd - rangeStart)) * 100 : 0 }));

  function handleTreeChange(id: string) {
    setTreeId(id);
    setIndex(0);
  }

  if (loading || !tree) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Timeline</h1>
          <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Timeline</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          Imagery, readings, and events for {tree.name}, synchronized.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {sortedTrees.map((t) => {
          const status = insightByTreeId[t.id]?.status ?? 'ok';
          return (
            <button
              key={t.id}
              onClick={() => handleTreeChange(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: t.id === treeId ? 'var(--ink)' : 'var(--surface)',
                color: t.id === treeId ? 'var(--canvas)' : 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span className={`status-dot status-${status}`} aria-hidden="true" style={t.id === treeId ? { background: 'var(--canvas)' } : undefined} />
              {t.name}
            </button>
          );
        })}
      </div>

      <Card>
        {nearestPhoto?.photo_url ? (
          <div style={{ marginBottom: 24 }}>
            <img
              src={photoUrl(nearestPhoto.photo_url)}
              alt={`${tree.name} — ${nearestPhoto.ts}`}
              style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8, display: 'block' }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }} className="mono">
              Nearest capture: {nearestPhoto.ts}
            </p>
          </div>
        ) : (
          <div
            style={{
              aspectRatio: '16 / 9',
              background: 'var(--canvas)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-faint)',
              fontSize: 13,
              marginBottom: 24,
            }}
          >
            No capture yet — image stage will populate once the camera is installed
          </div>
        )}

        {readings.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            No daily history yet for {tree.name} — real soil sensors went live 2026-08-18, and daily rollups are written once a day. Check back tomorrow.
          </p>
        ) : (
          <>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <div style={{ position: 'relative', height: 14 }}>
                {markers.map((m) => (
                  <div
                    key={m.id}
                    title={`${m.date}: ${m.label}`}
                    style={{
                      position: 'absolute',
                      left: `${m.pct}%`,
                      top: 0,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: m.source === 'ai' ? 'var(--insight)' : 'var(--brand)',
                      transform: 'translateX(-50%)',
                    }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, readings.length - 1)}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--ink)' }}
              />
            </div>

            {reading && (
              <div className="rgrid-4" style={{ gap: 16, marginTop: 16 }}>
                <MetricValue label="Date" value={reading.date} />
                <MetricValue
                  label="Soil moisture"
                  value={reading.soilMoistureAvg}
                  unit="%"
                  delta={moistureInRange ? 'In range' : 'Out of range'}
                  deltaTone={moistureInRange ? 'ok' : 'watch'}
                  tooltip={metricInfo.soilMoisture}
                />
                <MetricValue label="Soil temp" value={formatTemp(reading.soilTempAvg, system)} unit={tempUnit(system)} tooltip={metricInfo.soilTemp} />
                <MetricValue
                  label="EC"
                  value={reading.soilEcAvg}
                  unit="mS/cm"
                  delta={ecInRange ? 'In range' : 'Elevated'}
                  deltaTone={ecInRange ? 'ok' : 'watch'}
                  tooltip={metricInfo.ec}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {markers.length > 0 && (
        <Card>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Events in range
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {markers.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13 }}>
                <span className="mono" style={{ color: 'var(--ink-soft)', width: 80, flexShrink: 0 }}>
                  {m.date}
                </span>
                <span>{m.label}</span>
                {m.source === 'ai' && <span style={{ fontSize: 11, color: 'var(--insight)' }}>AI-suggested</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
