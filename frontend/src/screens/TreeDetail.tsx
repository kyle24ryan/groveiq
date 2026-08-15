import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
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
import {
  fetchTreeAnalyses,
  uploadTreePhoto,
  deleteTreeAnalysis,
  photoUrl,
  fetchTreeProfile,
  updateTreeProfile,
  requestCapture,
  fetchLatestCaptureRequest,
  type PhotoAnalysis,
  type TreeProfile,
  type TreeProfileEditableFields,
} from '../lib/api';

const CAPTURE_POLL_MS = 5000;
const CAPTURE_TIMEOUT_MS = 3 * 60 * 1000; // camera + script + vision analysis shouldn't take longer than this

export function TreeDetail() {
  const { system } = useUnits();
  const { treeId } = useParams<{ treeId: string }>();
  const tree = trees.find((t) => t.id === treeId);

  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysis[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoAnalysis | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [captureStatus, setCaptureStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const capturePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [profile, setProfile] = useState<TreeProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TreeProfileEditableFields>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    fetchTreeProfile(treeId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // Falls back to the static demo profile below (e.g. local dev
        // without a same-origin API, or the tree isn't seeded in D1 yet).
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  function startEdit() {
    if (!profile) return;
    setDraft({
      name: profile.name,
      nickname: profile.nickname ?? '',
      pot_size_liters: profile.pot_size_liters,
      origin_notes: profile.origin_notes ?? '',
      origin_type: profile.origin_type ?? '',
      acquired_date: profile.acquired_date ?? '',
      estimated_age_years_low: profile.estimated_age_years_low,
      estimated_age_years_high: profile.estimated_age_years_high,
      development_stage: profile.development_stage ?? '',
      notes: profile.notes ?? '',
      soil_moisture_threshold_low: profile.soil_moisture_threshold_low,
      soil_moisture_threshold_high: profile.soil_moisture_threshold_high,
      ec_threshold_high: profile.ec_threshold_high,
      dormancy_soil_temp_c: profile.dormancy_soil_temp_c,
    });
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveProfile() {
    if (!treeId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateTreeProfile(treeId, draft);
      setProfile(updated);
      setEditing(false);
    } catch {
      setSaveError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelected(file: File) {
    if (!treeId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadTreePhoto(treeId, file);
      setPhotoAnalyses((prev) => [result, ...prev]);
    } catch {
      setUploadError('please try again');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(id: number) {
    if (!treeId) return;
    if (!window.confirm('Delete this photo and its analysis? This removes the stored image too — it cannot be undone.')) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteTreeAnalysis(treeId, id);
      setPhotoAnalyses((prev) => prev.filter((a) => a.id !== id));
      setLightboxPhoto((prev) => (prev?.id === id ? null : prev));
    } catch {
      setDeleteError('Delete failed — please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  // "Capture now" doesn't reach the camera directly -- it queues a
  // request the local capture script picks up on its own poll cycle (see
  // scripts/camera-capture/README.md), so this just polls the Worker back
  // for that request's status until the script finishes it or the client
  // gives up waiting.
  async function handleCaptureNow() {
    if (!treeId) return;
    setCaptureStatus('pending');
    setCaptureError(null);
    try {
      await requestCapture(treeId);
    } catch {
      setCaptureStatus('error');
      setCaptureError("Couldn't reach GroveIQ to request a capture.");
      return;
    }

    const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
    const poll = async () => {
      try {
        const req = await fetchLatestCaptureRequest(treeId);
        if (req?.status === 'completed') {
          setCaptureStatus('idle');
          const analyses = await fetchTreeAnalyses(treeId);
          setPhotoAnalyses(analyses.filter((a) => a.kind === 'vision'));
          return;
        }
        if (req?.status === 'failed') {
          setCaptureStatus('error');
          setCaptureError(req.error ?? 'Capture failed.');
          return;
        }
      } catch {
        // Transient fetch failure -- keep polling until the deadline rather
        // than giving up on one bad request.
      }
      if (Date.now() > deadline) {
        setCaptureStatus('error');
        setCaptureError('No response from the camera script — is it running?');
        return;
      }
      capturePollRef.current = setTimeout(poll, CAPTURE_POLL_MS);
    };
    capturePollRef.current = setTimeout(poll, CAPTURE_POLL_MS);
  }

  useEffect(() => {
    return () => {
      if (capturePollRef.current) clearTimeout(capturePollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lightboxPhoto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxPhoto(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxPhoto]);

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
  const sibling = trees.find((t) => t.species === tree.species && t.id !== tree.id);
  const lastWatered = lastWateredFor(tree.id);

  // Editable fields prefer the live D1 profile once it loads; fall back to
  // the static demo profile (used for sensor-reading generation regardless).
  const displayName = profile?.name ?? tree.name;
  const displayNickname = profile ? profile.nickname : tree.nickname;
  const ageLow = profile ? profile.estimated_age_years_low : tree.estimatedAgeYearsLow;
  const ageHigh = profile ? profile.estimated_age_years_high : tree.estimatedAgeYearsHigh;
  const developmentStage = profile?.development_stage ?? tree.developmentStage;
  const moistureLow = profile?.soil_moisture_threshold_low ?? tree.soilMoistureThresholdLow;
  const moistureHigh = profile?.soil_moisture_threshold_high ?? tree.soilMoistureThresholdHigh;
  const ecThresholdHigh = profile?.ec_threshold_high ?? tree.ecThresholdHigh;
  const dormancySoilTempC = profile?.dormancy_soil_temp_c ?? tree.dormancySoilTempC;
  const potSizeLiters = profile ? profile.pot_size_liters : tree.potSizeLiters;
  const notes = profile ? profile.notes : tree.notes;

  const moistureInRange = latest.soilMoistureAvg >= moistureLow && latest.soilMoistureAvg <= moistureHigh;
  const ecInRange = latest.soilEcAvg <= ecThresholdHigh;
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
              {displayName}
              {displayNickname && <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}> "{displayNickname}"</span>}
            </h1>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: 4 }}>
              <Link to={`/species/${encodeURIComponent(tree.species)}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                {tree.species}
              </Link>
              {' · '}
              {ageLow && ageHigh ? `~${ageLow}-${ageHigh} years old` : 'age unknown'}
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{developmentStage}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                disabled={!profile}
                title={!profile ? 'Loading profile…' : undefined}
                style={{
                  fontSize: 12.5,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  cursor: profile ? 'pointer' : 'default',
                  opacity: profile ? 1 : 0.5,
                }}
              >
                Edit profile
              </button>
            )}
            <StatusBadge status={insight.status} />
          </div>
        </div>
      </div>

      {editing && (
        <TreeProfileEditForm
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setEditing(false)}
          onSave={handleSaveProfile}
          saving={saving}
          error={saveError}
        />
      )}

      <InsightPanel insight={insight} />

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Soil
        </div>
        <div className="rgrid-4" style={{ gap: 16 }}>
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
          <div className="rgrid-4" style={{ gap: 16, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>
                Moisture range
                <InfoTooltip text={metricInfo.moistureRange} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {moistureLow}-{moistureHigh}%
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>
                EC ceiling
                <InfoTooltip text={metricInfo.ecCeiling} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {ecThresholdHigh} mS/cm
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>
                Dormancy trigger
                <InfoTooltip text={metricInfo.dormancyTrigger} />
              </div>
              <div className="mono" style={{ marginTop: 2 }}>
                {formatTemp(dormancySoilTempC, system)}{tempUnit(system)} soil temp
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--ink-soft)' }}>Pot size</div>
              <div className="mono" style={{ marginTop: 2 }}>
                {potSizeLiters ? `${potSizeLiters}L` : 'not measured yet'}
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
          <div style={{ display: 'flex', gap: 16 }}>
            <Link to={`/species/${encodeURIComponent(tree.species)}`} style={{ fontSize: 12.5, color: 'var(--insight)' }}>
              Full species profile →
            </Link>
            {sibling && (
              <Link to={`/trees/compare/${tree.id}/${sibling.id}`} style={{ fontSize: 12.5, color: 'var(--insight)' }}>
                Compare with {sibling.name} →
              </Link>
            )}
          </div>
        </Card>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow">Imagery</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleCaptureNow}
              disabled={captureStatus === 'pending'}
              title="Requests a photo from the grove camera — needs the local capture script running"
              style={{
                fontSize: 12.5,
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                cursor: captureStatus === 'pending' ? 'default' : 'pointer',
                opacity: captureStatus === 'pending' ? 0.6 : 1,
              }}
            >
              {captureStatus === 'pending' ? 'Waiting for camera…' : 'Capture now'}
            </button>
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
          {photoAnalyses.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', padding: '8px 0' }}>No captures yet.</p>
          )}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {photoAnalyses.map((a) => (
              <div
                key={a.id}
                className="photo-thumb"
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
                {a.photo_url && (
                  <div className="photo-thumb-overlay">
                    <button
                      type="button"
                      onClick={() => setLightboxPhoto(a)}
                      style={{
                        fontSize: 11,
                        padding: '4px 9px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.6)',
                        background: 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(a.id)}
                      disabled={deletingId === a.id}
                      style={{
                        fontSize: 11,
                        padding: '4px 9px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.6)',
                        background: 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        cursor: deletingId === a.id ? 'default' : 'pointer',
                        opacity: deletingId === a.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === a.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {uploadError && (
            <p style={{ fontSize: 12, color: 'var(--urgent)', marginTop: 10 }}>Upload failed: {uploadError}</p>
          )}
          {captureStatus === 'error' && captureError && (
            <p style={{ fontSize: 12, color: 'var(--urgent)', marginTop: 10 }}>Capture failed: {captureError}</p>
          )}
          {deleteError && (
            <p style={{ fontSize: 12, color: 'var(--urgent)', marginTop: 10 }}>{deleteError}</p>
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

      <div className="rgrid-2" style={{ gap: 16 }}>
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

      {notes && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Notes
          </div>
          <Card>
            <p style={{ fontSize: 13.5 }}>{notes}</p>
          </Card>
        </div>
      )}

      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {lightboxPhoto.photo_url && (
              <img
                src={photoUrl(lightboxPhoto.photo_url)}
                alt={`${tree.name} — ${lightboxPhoto.ts}`}
                style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {lightboxPhoto.status && <StatusBadge status={lightboxPhoto.status} size="sm" />}
                <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                  {lightboxPhoto.ts}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(lightboxPhoto.id)}
                  disabled={deletingId === lightboxPhoto.id}
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.5)',
                    background: 'transparent',
                    color: '#fff',
                    cursor: deletingId === lightboxPhoto.id ? 'default' : 'pointer',
                    opacity: deletingId === lightboxPhoto.id ? 0.6 : 1,
                  }}
                >
                  {deletingId === lightboxPhoto.id ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.5)',
                    background: 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            {lightboxPhoto.detail && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{lightboxPhoto.detail}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--canvas)',
  color: 'var(--ink)',
  fontSize: 13.5,
};

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function TreeProfileEditForm({
  draft,
  setDraft,
  onCancel,
  onSave,
  saving,
  error,
}: {
  draft: TreeProfileEditableFields;
  setDraft: Dispatch<SetStateAction<TreeProfileEditableFields>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  function setField<K extends keyof TreeProfileEditableFields>(key: K, raw: string) {
    const numericFields: (keyof TreeProfileEditableFields)[] = [
      'pot_size_liters',
      'estimated_age_years_low',
      'estimated_age_years_high',
      'soil_moisture_threshold_low',
      'soil_moisture_threshold_high',
      'ec_threshold_high',
      'dormancy_soil_temp_c',
    ];
    if (numericFields.includes(key)) {
      setDraft((prev) => ({ ...prev, [key]: raw === '' ? null : Number(raw) }));
    } else {
      setDraft((prev) => ({ ...prev, [key]: raw }));
    }
  }

  return (
    <Card style={{ borderColor: 'var(--insight)' }}>
      <div className="eyebrow" style={{ marginBottom: 12, color: 'var(--insight)' }}>
        Edit profile
      </div>
      {error && <p style={{ fontSize: 12.5, color: 'var(--urgent)', marginBottom: 12 }}>{error}</p>}

      <div className="rgrid-3" style={{ gap: 14, marginBottom: 16 }}>
        <EditField label="Name" value={draft.name ?? ''} onChange={(v) => setField('name', v)} />
        <EditField label="Nickname" value={draft.nickname ?? ''} onChange={(v) => setField('nickname', v)} />
        <EditField label="Development stage" value={draft.development_stage ?? ''} onChange={(v) => setField('development_stage', v)} />
        <EditField label="Pot size (L)" type="number" value={draft.pot_size_liters ?? ''} onChange={(v) => setField('pot_size_liters', v)} />
        <EditField label="Age low (yrs)" type="number" value={draft.estimated_age_years_low ?? ''} onChange={(v) => setField('estimated_age_years_low', v)} />
        <EditField label="Age high (yrs)" type="number" value={draft.estimated_age_years_high ?? ''} onChange={(v) => setField('estimated_age_years_high', v)} />
        <EditField label="Origin type" value={draft.origin_type ?? ''} onChange={(v) => setField('origin_type', v)} />
        <EditField label="Acquired date" type="date" value={draft.acquired_date ?? ''} onChange={(v) => setField('acquired_date', v)} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 4 }}>Origin notes</div>
        <textarea
          value={draft.origin_notes ?? ''}
          onChange={(e) => setField('origin_notes', e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div className="eyebrow" style={{ marginBottom: 10, fontSize: 11 }}>
        Thresholds
      </div>
      <div className="rgrid-4" style={{ gap: 14, marginBottom: 16 }}>
        <EditField label="Moisture low (%)" type="number" value={draft.soil_moisture_threshold_low ?? ''} onChange={(v) => setField('soil_moisture_threshold_low', v)} />
        <EditField label="Moisture high (%)" type="number" value={draft.soil_moisture_threshold_high ?? ''} onChange={(v) => setField('soil_moisture_threshold_high', v)} />
        <EditField label="EC ceiling (mS/cm)" type="number" value={draft.ec_threshold_high ?? ''} onChange={(v) => setField('ec_threshold_high', v)} />
        <EditField label="Dormancy soil temp (°C)" type="number" value={draft.dormancy_soil_temp_c ?? ''} onChange={(v) => setField('dormancy_soil_temp_c', v)} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 4 }}>Notes</div>
        <textarea value={draft.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--ink)',
            color: 'var(--canvas)',
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 13,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}
