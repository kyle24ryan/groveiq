import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart } from 'recharts';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { StatusBadge } from '../components/StatusBadge';
import { trees, currentConditions, vpdKPa, hourlyConditionsToday, waterDemandNow, forecastNext7Days, insightFor } from '../data/mockData';
import type { Status } from '../data/types';

const compassPoints = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function compassLabel(deg: number): string {
  return compassPoints[Math.round(deg / 22.5) % 16];
}

// PM2.5 (µg/m³) EPA-style bands, simplified to our ok/watch/urgent language.
function aqiStatus(pm25: number): Status {
  if (pm25 > 35) return 'urgent';
  if (pm25 > 12) return 'watch';
  return 'ok';
}

// Rough WBGT flag-system bands (Celsius), simplified to ok/watch/urgent —
// not a substitute for a calibrated heat-stress guideline, just enough to
// flag "this is worth noticing."
function heatStressStatus(wbgtC: number): Status {
  if (wbgtC > 30) return 'urgent';
  if (wbgtC > 27) return 'watch';
  return 'ok';
}

export function Environment() {
  const hourly = hourlyConditionsToday();
  const forecast = forecastNext7Days();
  const demand = waterDemandNow();
  const vpd = vpdKPa();
  const rainNext48h = forecast.slice(0, 2);
  const priorityInsight = [...trees.map((t) => insightFor(t.id))].sort((a, b) => {
    const rank = { urgent: 0, watch: 1, ok: 2 } as const;
    return rank[a.status] - rank[b.status];
  })[0];
  const priorityTree = trees.find((t) => t.id === priorityInsight.treeId);
  const aqi = aqiStatus(currentConditions.pm25);
  const heatStress = heatStressStatus(currentConditions.wbgtC);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Environment</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          North Bend, WA · Zone 8b — what current conditions mean for the grove.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Outdoor
          </div>
          <MetricValue label="Temperature" value={currentConditions.outdoorTempC} unit="°C" />
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            ↑ {currentConditions.outdoorTempHighC}° &nbsp; ↓ {currentConditions.outdoorTempLowC}°
          </div>
          <div style={{ marginTop: 10, fontSize: 13 }}>
            {currentConditions.humidityPct}% humidity · VPD {vpd} kPa
          </div>
        </Card>

        <Card>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Wind
          </div>
          <MetricValue label="Speed" value={currentConditions.windMph} unit="mph" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13 }}>
            <span
              style={{
                display: 'inline-block',
                transform: `rotate(${currentConditions.windDirDeg}deg)`,
                fontSize: 14,
              }}
              aria-hidden="true"
            >
              ↑
            </span>
            {compassLabel(currentConditions.windDirDeg)} ({currentConditions.windDirDeg}°)
          </div>
        </Card>

        <Card>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Pressure & rain
          </div>
          <MetricValue label="Pressure" value={currentConditions.pressureHpa} unit="hPa" />
          <div style={{ marginTop: 10, fontSize: 13 }}>{currentConditions.rainIn === 0 ? 'No rain today' : `${currentConditions.rainIn}in today`}</div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div className="eyebrow">Air quality</div>
            <StatusBadge status={aqi} size="sm" />
          </div>
          <MetricValue label="PM2.5" value={currentConditions.pm25} unit="µg/m³" />
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div className="eyebrow">Heat stress</div>
            <StatusBadge status={heatStress} size="sm" />
          </div>
          <MetricValue label="Black globe" value={currentConditions.blackGlobeTempC} unit="°C" />
          <div style={{ marginTop: 10, fontSize: 13 }}>WBGT {currentConditions.wbgtC}°C</div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          24-hour conditions
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={hourly}>
            <defs>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--watch)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--watch)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} minTickGap={40} />
            <YAxis yAxisId="temp" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} />
            <YAxis yAxisId="humidity" orientation="right" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} width={32} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            <Area yAxisId="temp" type="monotone" dataKey="tempC" stroke="var(--watch)" fill="url(#tempGradient)" strokeWidth={1.75} />
            <Line yAxisId="humidity" type="monotone" dataKey="humidityPct" stroke="var(--insight)" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
          <span>
            <span style={{ color: 'var(--watch)' }}>■</span> Temp (°C)
          </span>
          <span>
            <span style={{ color: 'var(--insight)' }}>■</span> Humidity (%)
          </span>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Water demand
          </div>
          <div className={`status-${demand.tone}`} style={{ fontSize: 22, fontWeight: 600 }}>
            {demand.label}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
            Based on current VPD ({vpd} kPa) and solar load. Highest demand typically falls between 1-5pm.
          </p>
        </Card>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Rain outlook
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{currentConditions.rainIn === 0 ? 'None observed today' : `${currentConditions.rainIn}in today`}</div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
            Next 48h: {rainNext48h.map((d) => `${d.precipChancePct}%`).join(' / ')} chance of precipitation.
          </p>
        </Card>
      </div>

      <Card style={{ borderColor: 'var(--insight)' }}>
        <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--insight)' }}>
          Grove impact
        </div>
        <p style={{ fontSize: 13.5 }}>
          High evaporative demand is expected through this afternoon.{' '}
          {priorityTree && priorityInsight.implication ? `${priorityTree.name} ${priorityInsight.implication.toLowerCase()}` : 'No trees are projected to cross a threshold today.'}
        </p>
      </Card>
    </div>
  );
}
