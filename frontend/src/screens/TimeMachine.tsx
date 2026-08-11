import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { trees, dailyReadingsFor } from '../data/mockData';

export function TimeMachine() {
  const [treeId, setTreeId] = useState(trees[0].id);
  const readings = useMemo(() => dailyReadingsFor(treeId), [treeId]);
  const [index, setIndex] = useState(readings.length - 1);

  const tree = trees.find((t) => t.id === treeId)!;
  const reading = readings[Math.min(index, readings.length - 1)];

  function handleTreeChange(id: string) {
    setTreeId(id);
    setIndex(dailyReadingsFor(id).length - 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Time Machine</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Scrub through {tree.name}'s history.</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {trees.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTreeChange(t.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: t.id === treeId ? 'var(--moss)' : 'var(--paper)',
              color: t.id === treeId ? 'var(--paper)' : 'var(--ink)',
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
            aspectRatio: '4 / 3',
            background: 'var(--linen)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-soft)',
            fontSize: 14,
            marginBottom: 20,
          }}
        >
          Photo placeholder — no camera capture yet
        </div>

        <input
          type="range"
          min={0}
          max={readings.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--moss)' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Date</div>
            <div className="mono" style={{ fontSize: 16 }}>
              {reading.date}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Moisture</div>
            <div className="mono" style={{ fontSize: 16 }}>
              {reading.soilMoistureAvg}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Soil temp</div>
            <div className="mono" style={{ fontSize: 16 }}>
              {reading.soilTempAvg}°C
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>EC</div>
            <div className="mono" style={{ fontSize: 16 }}>
              {reading.soilEcAvg}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
