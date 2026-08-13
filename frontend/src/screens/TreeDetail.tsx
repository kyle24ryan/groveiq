import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { MetricValue } from '../components/MetricValue';
import { ReadingChart } from '../components/ReadingChart';
import { InsightPanel } from '../components/InsightPanel';
import { InfoTooltip } from '../components/InfoTooltip';
import { metricInfo } from '../data/metricInfo';
import { trees, speciesReference, dailyReadingsFor, insightFor, milestonesFor, lastWateredFor } from '../data/mockData';
import { useUnits } from '../contexts/UnitsContext';
import { convertTemp, formatTemp, tempUnit } from '../lib/units';
import { fetchTreeAnalyses, uploadTreePhoto, photoUrl, type PhotoAnalysis } from '../lib/api';

export function TreeDetail() {
  const { system } = useUnits();
  const { treeId } = useParams<{ treeId: string }>();
  const tree = trees.find((t) => t.id === treeId);

  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysis[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    fetchTreeAnalyses(treeId)
      .then((analyses) => {
        if (!cancelled) setPhotoAnalyses(analyses.filter((a) => a.kind === 'vision'));
      })
      .catch(() => {
        // Imagery section falls back to placeholders below; not worth a
        // hard error banner for a background fetch.
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  async function handleFileSelected(file: File) {
    if (!treeId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadTreePhoto(treeId, file);
      setPhotoAnalyses((prev) => [result, ...prev]);
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
    }
  }

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
  const readingsInDisplayUnits = readings.map((r) => ({ ...r, soilTempAvg: convertTemp(r.soilTempAvg, system) }));

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
              tooltip={metricInfo.soilMoisture}
            />
          </Card>
          <Card>
            <MetricValue label="EC" value={latest.soilEcAvg} unit="mS/cm" delta={ecInRange ? 'In range' : 'Elevated'} deltaTone={ecInRange ? 'ok' : 'watch'} tooltip={metricInfo.ec} />
          </Card>
          <Card>
            <MetricValue label="Soil temp" value={formatTemp(latest.soilTempAvg, system)} unit={tempUnit(system)} tooltip={metricInfo.soilTemp} />
          </Card>
          <Card>
            <MetricValue label="Last watered" value={lastWatered} tooltip={metricInfo.lastWatered} />
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
              <div style={{ color: 'var(--ink-soft)' }}>
                Moisture range
                <InfoTooltip text={metricInfo.moistureRange} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.soilMoistureThresholdLow}-{tree.soilMoistureThresholdHigh}%
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>
                EC ceiling
                <InfoTooltip text={metricInfo.ecCeiling} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {tree.ecThresholdHigh} mS/cm
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>
                Dormancy trigger
                <InfoTooltip text={metricInfo.dormancyTrigger} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {formatTemp(tree.dormancySoilTempC, system)}{tempUnit(system)} soil temp
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow">Imagery</div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                fontSize: 12.5,
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                cursor: uploading ? 'default' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? 'Analyzing…' : 'Upload photo for analysis'}
            </button>
          </div>
        </div>
        <Card>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {photoAnalyses.map((a) => (
              <div
                key={a.id}
                title={a.summary ?? undefined}
                style={{
                  flex: '0 0 auto',
                  width: 120,
                  aspectRatio: '4 / 3',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `2px solid var(--${a.status === 'ok' ? 'ok' : a.status === 'watch' ? 'watch' : a.status === 'urgent' ? 'urgent' : 'border'})`,
                }}
              >
                {a.photo_url && (
                  <img src={photoUrl(a.photo_url)} alt={`${tree.name} — ${a.ts}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - photoAnalyses.length) }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
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

          {uploadError && (
            <p style={{ fontSize: 12, color: 'var(--urgent)', marginTop: 10 }}>Upload failed: {uploadError}</p>
          )}

          {photoAnalyses[0] && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {photoAnalyses[0].status && <StatusBadge status={photoAnalyses[0].status} size="sm" />}
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                  {photoAnalyses[0].ts}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{photoAnalyses[0].detail}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {photoAnalyses.length > 0
                ? 'Weekly automated captures will also appear here once the camera is installed.'
                : 'Weekly automated captures will appear here once the camera is installed — or upload a photo now for an on-demand check.'}
            </p>
            <Link to="/timeline" style={{ fontSize: 12.5, color: 'var(--insight)', flexShrink: 0 }}>
              View in Timeline →
            </Link>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ReadingChart title="Soil moisture — last 30 days" data={readings} dataKey="soilMoistureAvg" color="var(--ok)" unit="%" />
        <ReadingChart title="Soil temperature — last 30 days" data={readingsInDisplayUnits} dataKey="soilTempAvg" color="var(--insight)" unit={tempUnit(system)} />
      </div>
      <ReadingChart title="Soil EC — last 30 days" data={readings} dataKey="soilEcAvg" color="var(--watch)" unit=" mS/cm" />

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
