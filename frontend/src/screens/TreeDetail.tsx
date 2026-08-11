import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { MetricValue } from '../components/MetricValue';
import { ReadingChart } from '../components/ReadingChart';
import { InsightPanel } from '../components/InsightPanel';
import { trees, speciesReference, dailyReadingsFor, insightFor, milestonesFor, lastWateredFor } from '../data/mockData';

export function TreeDetail() {
  const { treeId } = useParams<{ treeId: string }>();
  const tree = trees.find((t) => t.id === treeId);

  if (!tree) {
    return (
      <div>
        <p>Tree not found.</p>
        <Link to="/trees">Back to Trees</Link>
      </div>
    );
  }

  const insight = insightFor(tree.id);
  const readings = dailyReadingsFor(tree.id);
  const milestones = milestonesFor(tree.id);
  const latest = readings[readings.length - 1];
  const species = speciesReference.find((s) => s.species === tree.species);
  const lastWatered = lastWateredFor(tree.id);

  const moistureInRange = latest.soilMoistureAvg >= tree.soilMoistureThresholdLow && latest.soilMoistureAvg <= tree.soilMoistureThresholdHigh;
  const ecInRange = latest.soilEcAvg <= tree.ecThresholdHigh;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <div>
        <Link to="/trees" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          ← Trees
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24 }}>
              {tree.name}
              {tree.nickname && <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}> "{tree.nickname}"</span>}
            </h1>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: 4 }}>
              <Link to={`/species/${encodeURIComponent(tree.species)}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                {tree.species}
              </Link>
              {' · '}
              {tree.estimatedAgeYearsLow && tree.estimatedAgeYearsHigh
                ? `~${tree.estimatedAgeYearsLow}-${tree.estimatedAgeYearsHigh} years old`
                : 'age unknown'}
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{tree.developmentStage}</span>
            </div>
          </div>
          <StatusBadge status={insight.status} />
        </div>
      </div>

      <InsightPanel insight={insight} />

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Soil
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Card>
            <MetricValue
              label="Soil moisture"
              value={latest.soilMoistureAvg}
              unit="%"
              delta={moistureInRange ? 'In range' : 'Out of range'}
              deltaTone={moistureInRange ? 'ok' : 'watch'}
            />
          </Card>
          <Card>
            <MetricValue label="EC" value={latest.soilEcAvg} delta={ecInRange ? 'In range' : 'Elevated'} deltaTone={ecInRange ? 'ok' : 'watch'} />
          </Card>
          <Card>
            <MetricValue label="Soil temp" value={latest.soilTempAvg} unit="°C" />
          </Card>
          <Card>
            <MetricValue label="Last watered" value={lastWatered} />
          </Card>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Baselines & thresholds
        </div>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>Moisture range</div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.soilMoistureThresholdLow}-{tree.soilMoistureThresholdHigh}%
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>EC ceiling</div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.ecThresholdHigh}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>Dormancy trigger</div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.dormancySoilTempC}°C soil temp
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>Pot size</div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.potSizeLiters ? `${tree.potSizeLiters}L` : 'not measured yet'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {species && (
        <Card style={{ borderColor: 'var(--insight)' }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--insight)' }}>
            How this applies to {tree.name}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{species.aiNotes}</p>
          <Link to={`/species/${encodeURIComponent(tree.species)}`} style={{ fontSize: 12.5, color: 'var(--insight)' }}>
            Full species profile →
          </Link>
        </Card>
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Imagery
        </div>
        <Card>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: '0 0 auto',
                  width: 120,
                  aspectRatio: '4 / 3',
                  background: 'var(--canvas)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-faint)',
                  fontSize: 11,
                  textAlign: 'center',
                  padding: 8,
                }}
              >
                No capture yet
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Weekly automated captures will appear here once the camera is installed.</p>
            <Link to="/timeline" style={{ fontSize: 12.5, color: 'var(--insight)', flexShrink: 0 }}>
              View in Timeline →
            </Link>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ReadingChart title="Soil moisture — last 30 days" data={readings} dataKey="soilMoistureAvg" color="var(--ok)" unit="%" />
        <ReadingChart title="Soil temperature — last 30 days" data={readings} dataKey="soilTempAvg" color="var(--insight)" unit="°C" />
      </div>
      <ReadingChart title="Soil EC — last 30 days" data={readings} dataKey="soilEcAvg" color="var(--watch)" />

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Interventions & events
        </div>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {milestones.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', width: 80, flexShrink: 0 }}>
                  {m.date}
                </div>
                <div style={{ fontSize: 13.5 }}>{m.label}</div>
                {m.source === 'ai' && (
                  <div style={{ fontSize: 11, color: 'var(--insight)' }}>AI-suggested</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {tree.notes && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Notes
          </div>
          <Card>
            <p style={{ fontSize: 13.5 }}>{tree.notes}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
