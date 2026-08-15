import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { trees, dailyReadingsFor, milestonesFor, insightFor } from '../data/mockData';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';
import { metricInfo } from '../data/metricInfo';
import { fetchTreeAnalyses, photoUrl, type PhotoAnalysis } from '../lib/api';
import type { Status } from '../data/types';

const RANGE_DAYS = 90;
const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

// Tree picker and default selection are worst-first, matching the
// sidebar/Overview convention -- previously defaulted to trees[0] and
// listed trees in raw array order regardless of what needed attention.
const sortedTrees = [...trees].sort((a, b) => rank[insightFor(a.id).status] - rank[insightFor(b.id).status]);

export function Timeline() {
  const { system } = useUnits();
  const [treeId, setTreeId] = useState(sortedTrees[0].id);
  const readings = useMemo(() => dailyReadingsFor(treeId, RANGE_DAYS), [treeId]);
  const milestones = useMemo(() => milestonesFor(treeId), [treeId]);
  const [index, setIndex] = useState(readings.length - 1);
  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysis[]>([]);

  useEffect(() => {
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

  const tree = trees.find((t) => t.id === treeId)!;
  const reading = readings[Math.min(index, readings.length - 1)];

  // Nearest real photo in time to the scrubbed date, matching this page's
  // own "imagery, readings, and events... synchronized" framing -- not
  // just always showing the latest capture regardless of scrub position.
  const nearestPhoto = useMemo(() => {
    if (photoAnalyses.length === 0) return null;
    const targetMs = new Date(reading.date).getTime();
    return photoAnalyses.reduce((closest, a) => {
      const aDiff = Math.abs(new Date(a.ts).getTime() - targetMs);
      const closestDiff = Math.abs(new Date(closest.ts).getTime() - targetMs);
      return aDiff < closestDiff ? a : closest;
    });
  }, [photoAnalyses, reading.date]);
  const moistureInRange = reading.soilMoistureAvg >= tree.soilMoistureThresholdLow && reading.soilMoistureAvg <= tree.soilMoistureThresholdHigh;
  const ecInRange = reading.soilEcAvg <= tree.ecThresholdHigh;

  const rangeStart = new Date(readings[0].date).getTime();
  const rangeEnd = new Date(readings[readings.length - 1].date).getTime();
  const markers = milestones
    .filter((m) => {
      const t = new Date(m.date).getTime();
      return t >= rangeStart && t <= rangeEnd;
    })
    .map((m) => ({ ...m, pct: ((new Date(m.date).getTime() - rangeStart) / (rangeEnd - rangeStart)) * 100 }));

  function handleTreeChange(id: string) {
    setTreeId(id);
    setIndex(dailyReadingsFor(id, RANGE_DAYS).length - 1);
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
          const status = insightFor(t.id).status;
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
            max={readings.length - 1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--ink)' }}
          />
        </div>

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
