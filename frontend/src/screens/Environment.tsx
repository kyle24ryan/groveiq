import { useEffect, useState } from 'react';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart } from 'recharts';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { StatusBadge } from '../components/StatusBadge';
import { InfoTooltip } from '../components/InfoTooltip';
import { AlertBanner } from '../components/AlertBanner';
import { metricInfo } from '../data/metricInfo';
import { trees, vpdKPa, waterDemandNow, insightFor } from '../data/mockData';
import {
  fetchLatestConditions,
  fetchConditionsHistory,
  fetchForecast,
  fetchSunTimes,
  fetchRegionalAqi,
  freshnessLabel,
  type ConditionsReading,
  type ForecastDay,
  type SunTimes,
  type RegionalAqi,
} from '../lib/api';
import { useUnits } from '../contexts/UnitsContext';
import { convertTemp, tempUnit, formatTemp, formatWindSpeed, windSpeedUnit, formatPressure, pressureUnit, formatRain, rainUnit } from '../lib/units';
import type { Status } from '../data/types';

const compassPoints = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function compassLabel(deg: number): string {
  return compassPoints[Math.round(deg / 22.5) % 16];
}

// Standard US EPA AQI categories, mapped to our ok/watch/urgent language.
function aqiCategory(aqi: number): { label: string; status: Status } {
  if (aqi <= 50) return { label: 'Good', status: 'ok' };
  if (aqi <= 100) return { label: 'Moderate', status: 'watch' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', status: 'watch' };
  if (aqi <= 200) return { label: 'Unhealthy', status: 'urgent' };
  if (aqi <= 300) return { label: 'Very unhealthy', status: 'urgent' };
  return { label: 'Hazardous', status: 'urgent' };
}

// Rough WBGT flag-system bands (Celsius), simplified to ok/watch/urgent —
// not a substitute for a calibrated heat-stress guideline, just enough to
// flag "this is worth noticing."
function heatStressStatus(wbgtC: number): Status {
  if (wbgtC > 30) return 'urgent';
  if (wbgtC > 27) return 'watch';
  return 'ok';
}

function fmt(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

export function Environment() {
  const { system } = useUnits();
  const [latest, setLatest] = useState<ConditionsReading | null>(null);
  const [history, setHistory] = useState<ConditionsReading[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [regionalAqi, setRegionalAqi] = useState<RegionalAqi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLatestConditions(), fetchConditionsHistory(24)])
      .then(([latestReading, historyReadings]) => {
        if (cancelled) return;
        setLatest(latestReading);
        setHistory(historyReadings);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Forecast/sun/regional-AQI are independent of the live conditions feed
    // and shouldn't block or be blocked by it — fetched separately, each
    // failing silently since none of them are the primary content here.
    fetchForecast()
      .then((f) => !cancelled && setForecast(f))
      .catch(() => {});
    fetchSunTimes()
      .then((s) => !cancelled && setSunTimes(s))
      .catch(() => {});
    fetchRegionalAqi()
      .then((r) => !cancelled && setRegionalAqi(r))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const rainNext48h = forecast.slice(0, 2);
  const priorityInsight = [...trees.map((t) => insightFor(t.id))].sort((a, b) => {
    const rank = { urgent: 0, watch: 1, ok: 2 } as const;
    return rank[a.status] - rank[b.status];
  })[0];
  const priorityTree = trees.find((t) => t.id === priorityInsight.treeId);

  const vpd = latest?.outdoor_temp_c != null && latest?.humidity_pct != null ? vpdKPa(latest.outdoor_temp_c, latest.humidity_pct) : null;
  const demand = vpd !== null ? waterDemandNow(vpd) : null;
  const aqi = latest?.pm25_aqi != null ? aqiCategory(latest.pm25_aqi) : null;
  const heatStress = latest?.wbgt_c != null ? heatStressStatus(latest.wbgt_c) : null;
  const freshness = freshnessLabel(latest?.ts ?? null);

  const chartData = history.map((r) => ({
    hour: new Date(r.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    temp: r.outdoor_temp_c != null ? convertTemp(r.outdoor_temp_c, system) : null,
    humidityPct: r.humidity_pct,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Environment</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          North Bend, WA · Zone 8b — what current conditions mean for the grove.
          <span
            className={`mono status-${freshness.stale ? 'watch' : 'ok'}`}
            style={{ marginLeft: 10, fontSize: 12 }}
          >
            {loading ? 'Loading…' : error ? 'Live feed unreachable' : freshness.label}
          </span>
          {!loading && !error && <InfoTooltip text={metricInfo.dataFreshness} />}
        </p>
      </div>

      <AlertBanner />

      {error && (
        <Card style={{ borderColor: 'var(--urgent)' }}>
          <p style={{ fontSize: 13.5, color: 'var(--urgent)' }}>
            Couldn't reach the live weather feed ({error}). Showing nothing rather than stale or fabricated numbers.
          </p>
        </Card>
      )}

      {!error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Outdoor
              </div>
              <MetricValue label="Temperature" value={loading ? '—' : formatTemp(latest?.outdoor_temp_c ?? null, system)} unit={tempUnit(system)} tooltip={metricInfo.outdoorTemp} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {loading ? '—' : `${fmt(latest?.humidity_pct ?? null, 0)}% humidity`} · VPD {vpd !== null ? vpd.toFixed(2) : '—'} kPa
                <InfoTooltip text={metricInfo.vpd} />
              </div>
            </Card>

            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Wind
              </div>
              <MetricValue label="Speed" value={loading ? '—' : formatWindSpeed(latest?.wind_mph ?? null, system)} unit={windSpeedUnit(system)} tooltip={metricInfo.windSpeed} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13 }}>
                {latest?.wind_dir_deg != null ? (
                  <>
                    <span style={{ display: 'inline-block', transform: `rotate(${latest.wind_dir_deg}deg)`, fontSize: 14 }} aria-hidden="true">
                      ↑
                    </span>
                    {compassLabel(latest.wind_dir_deg)} ({latest.wind_dir_deg}°)
                    <InfoTooltip text={metricInfo.windDirection} />
                  </>
                ) : (
                  <span style={{ color: 'var(--ink-faint)' }}>Direction not yet reported</span>
                )}
              </div>
            </Card>

            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Pressure & rain
              </div>
              <MetricValue label="Pressure" value={formatPressure(latest?.pressure_hpa ?? null, system)} unit={pressureUnit(system)} tooltip={metricInfo.pressure} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {latest?.rain_in === 0 || latest?.rain_in == null ? 'No rain today' : `${formatRain(latest.rain_in, system)}${rainUnit(system)} today`}
                <InfoTooltip text={metricInfo.rain} />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">
                  Air quality
                  <InfoTooltip text={metricInfo.aqi} />
                </div>
                {aqi && <StatusBadge status={aqi.status} size="sm" />}
              </div>
              <MetricValue label="AQI" value={loading ? '—' : fmt(latest?.pm25_aqi ?? null, 0)} tooltip={metricInfo.aqi} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {aqi ? aqi.label : '—'} · PM2.5 {loading ? '—' : fmt(latest?.pm25 ?? null, 0)} µg/m³
              </div>
              {regionalAqi?.airnow_aqi != null && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  Regional (AirNow, {regionalAqi.reporting_area}): AQI {regionalAqi.airnow_aqi.toFixed(0)} {regionalAqi.airnow_category}
                  {regionalAqi.discussion && <p style={{ marginTop: 4, lineHeight: 1.4 }}>{regionalAqi.discussion}</p>}
                </div>
              )}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">
                  Heat stress
                  <InfoTooltip text={metricInfo.heatStress} />
                </div>
                {heatStress && <StatusBadge status={heatStress} size="sm" />}
              </div>
              <MetricValue label="Black globe" value={formatTemp(latest?.black_globe_temp_c ?? null, system)} unit={tempUnit(system)} tooltip={metricInfo.blackGlobe} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                WBGT {formatTemp(latest?.wbgt_c ?? null, system)}{tempUnit(system)}
                <InfoTooltip text={metricInfo.wbgt} />
              </div>
            </Card>
          </div>

          <Card>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              24-hour conditions
            </div>
            {chartData.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                {loading ? 'Loading…' : 'Not enough history yet — the feed just went live.'}
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData}>
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
                    <Area yAxisId="temp" type="monotone" dataKey="temp" stroke="var(--watch)" fill="url(#tempGradient)" strokeWidth={1.75} connectNulls />
                    <Line yAxisId="humidity" type="monotone" dataKey="humidityPct" stroke="var(--insight)" strokeWidth={1.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  <span>
                    <span style={{ color: 'var(--watch)' }}>■</span> Temp ({tempUnit(system)})
                  </span>
                  <span>
                    <span style={{ color: 'var(--insight)' }}>■</span> Humidity (%)
                  </span>
                </div>
              </>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Water demand
                <InfoTooltip text={metricInfo.waterDemand} />
              </div>
              {demand ? (
                <>
                  <div className={`status-${demand.tone}`} style={{ fontSize: 22, fontWeight: 600 }}>
                    {demand.label}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
                    Based on current VPD ({vpd?.toFixed(2)} kPa). Highest demand typically falls between 1-5pm.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Waiting on live data.</p>
              )}
            </Card>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Rain outlook
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-faint)', textTransform: 'none' }}>NWS forecast</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                {latest?.rain_in === 0 || latest?.rain_in == null ? 'None observed today' : `${formatRain(latest.rain_in, system)}${rainUnit(system)} today`}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
                {rainNext48h.length > 0
                  ? `Next 48h: ${rainNext48h.map((d) => `${d.precip_chance_pct ?? 0}%`).join(' / ')} chance of precipitation.`
                  : 'Forecast unavailable.'}
              </p>
            </Card>
          </div>

          <Card>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              7-day forecast
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-faint)', textTransform: 'none' }}>NWS, North Bend WA</span>
            </div>
            {forecast.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Forecast unavailable.</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {forecast.map((d) => (
                  <div
                    key={d.date}
                    style={{
                      flex: '0 0 auto',
                      minWidth: 90,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${d.frost_risk ? 'var(--watch)' : 'var(--border)'}`,
                      background: d.frost_risk ? 'var(--watch-bg)' : 'transparent',
                    }}
                  >
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {d.high_temp_f != null ? formatTemp(((d.high_temp_f - 32) * 5) / 9, system) : '—'}° / {d.low_temp_f != null ? formatTemp(((d.low_temp_f - 32) * 5) / 9, system) : '—'}°
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{d.precip_chance_pct ?? 0}% rain</div>
                    {d.frost_risk === 1 && <div style={{ fontSize: 11, color: 'var(--watch)', marginTop: 2 }}>Frost risk</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {sunTimes && (
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Sun
              </div>
              <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Sunrise</div>
                  <div className="mono" style={{ fontSize: 16, marginTop: 2 }}>
                    {sunTimes.sunrise}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Sunset</div>
                  <div className="mono" style={{ fontSize: 16, marginTop: 2 }}>
                    {sunTimes.sunset}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Day length</div>
                  <div className="mono" style={{ fontSize: 16, marginTop: 2 }}>
                    {sunTimes.dayLengthHours}h
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card style={{ borderColor: 'var(--insight)' }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--insight)' }}>
              Grove impact
            </div>
            <p style={{ fontSize: 13.5 }}>
              {demand ? `${demand.label} evaporative demand right now (VPD ${vpd?.toFixed(2)} kPa).` : 'Waiting on live data.'}{' '}
              {priorityTree && priorityInsight.implication
                ? `${priorityTree.name} ${priorityInsight.implication.toLowerCase()} (demo tree data — soil sensors not yet installed.)`
                : 'No trees are projected to cross a threshold today.'}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
