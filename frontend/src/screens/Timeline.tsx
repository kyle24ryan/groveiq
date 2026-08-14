import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { trees, dailyReadingsFor, milestonesFor } from '../data/mockData';
import { useUnits } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';
import { metricInfo } from '../data/metricInfo';

const RANGE_DAYS = 90;

export function Timeline() {
  const { system } = useUnits();
  const [treeId, setTreeId] = useState(trees[0].id);
  const readings = useMemo(() => dailyReadingsFor(treeId, RANGE_DAYS), [treeId]);
  const milestones = useMemo(() => milestonesFor(treeId), [treeId]);
  const [index, setIndex] = useState(readings.length - 1);

  const tree = trees.find((t) => t.id === treeId)!;
  const reading = readings[Math.min(index, readings.length - 1)];

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
        {trees.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTreeChange(t.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: t.id === treeId ? 'var(--ink)' : 'var(--surface)',
              color: t.id === treeId ? 'var(--canvas)' : 'var(--ink)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      <Card>
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
          <MetricValue label="Soil moisture" value={reading.soilMoistureAvg} unit="%" tooltip={metricInfo.soilMoisture} />
          <MetricValue label="Soil temp" value={formatTemp(reading.soilTempAvg, system)} unit={tempUnit(system)} tooltip={metricInfo.soilTemp} />
          <MetricValue label="EC" value={reading.soilEcAvg} unit="mS/cm" tooltip={metricInfo.ec} />
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
