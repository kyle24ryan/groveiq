import { useParams, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { GrowthRing } from '../components/GrowthRing';
import { trees, dailyReadingsFor, latestAnalysisFor, statusFor, milestonesFor } from '../data/mockData';

export function TreeDetail() {
  const { treeId } = useParams<{ treeId: string }>();
  const tree = trees.find((t) => t.id === treeId);

  if (!tree) {
    return (
      <div>
        <p>Tree not found.</p>
        <Link to="/">Back to Overview</Link>
      </div>
    );
  }

  const status = statusFor(tree.id);
  const analysis = latestAnalysisFor(tree.id);
  const readings = dailyReadingsFor(tree.id);
  const milestones = milestonesFor(tree.id);
  const latestMoisture = readings[readings.length - 1].soilMoistureAvg;
  const daysUntilWatering = Math.max(0.5, Math.round(((latestMoisture - tree.soilMoistureThresholdLow) / 3) * 10) / 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <Link to="/" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          ← Overview
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <GrowthRing size={40} rings={6} color={`var(--${status === 'ok' ? 'moss' : status === 'watch' ? 'amber' : 'brick'})`} />
          <div>
            <h1 style={{ fontSize: 28 }}>
              {tree.name}
              {tree.nickname && <span style={{ color: 'var(--clay)', fontWeight: 500 }}> "{tree.nickname}"</span>}
            </h1>
            <div style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
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
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 8 }}>
              Sensei's take
            </div>
            <StatusBadge status={status} />
            <p style={{ marginTop: 10, maxWidth: 560 }}>{analysis.detail}</p>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
            Smart watering
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>
            {daysUntilWatering} days until watering
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 6 }}>
            Based on recent moisture decline and cooler weather this week.
          </p>
        </Card>
        <Card>
          <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
            Origin
          </div>
          <p style={{ fontSize: 14, marginTop: 6 }}>{tree.originNotes ?? 'Not recorded yet.'}</p>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            Pot: {tree.potSizeLiters ? `${tree.potSizeLiters}L` : 'not measured yet'}
          </div>
        </Card>
      </div>

      {tree.notes && (
        <Card>
          <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
            Notes
          </div>
          <p style={{ fontSize: 14, marginTop: 6 }}>{tree.notes}</p>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Soil moisture — last 30 days
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={readings}>
            <defs>
              <linearGradient id="moistureGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--moss)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--moss)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} />
            <Tooltip
              contentStyle={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="soilMoistureAvg" stroke="var(--moss)" fill="url(#moistureGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Milestones
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {milestones.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', width: 80, flexShrink: 0 }}>
                {m.date}
              </div>
              <div style={{ fontSize: 14 }}>{m.label}</div>
              {m.source === 'ai' && (
                <div style={{ fontSize: 11, color: 'var(--clay)', fontFamily: 'var(--font-mono)' }}>AI-suggested</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
