import { useEffect, useState } from 'react';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart } from 'recharts';
import { Card } from '../components/Card';
import { MetricValue } from '../components/MetricValue';
import { StatusBadge } from '../components/StatusBadge';
import { InfoTooltip } from '../components/InfoTooltip';
import { AlertBanner } from '../components/AlertBanner';
import { RegionalMaps } from '../components/RegionalMaps';
import { EnvironmentalContextPanel } from '../components/environment-map/EnvironmentalContextPanel';
import { Collapsible } from '../components/Collapsible';
import { MiniTrendChart, ChartToggle, useChartToggle } from '../components/MiniTrendChart';
import { RangeSelector } from '../components/RangeSelector';
import { metricInfo } from '../data/metricInfo';
import { aqiCategory } from '../lib/aqi';
import { vpdKPa, waterDemandNow } from '../data/mockData';
import { useTreeInsights } from '../hooks/useTreeInsights';
import {
  fetchLatestConditions,
  fetchConditionsHistory,
  fetchDailyConditionsHistory,
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
import { convertTemp, tempUnit, formatTemp, convertWindSpeed, formatWindSpeed, windSpeedUnit, convertPressure, formatPressure, pressureUnit, formatRain, rainUnit } from '../lib/units';
import type { Status, TrendRange } from '../data/types';
import { HOUR_RANGE_WINDOW_HOURS, daysForRange, formatXForRange, emptyMessageForRange } from '../lib/trendRange';

const compassPoints = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function compassLabel(deg: number): string {
  return compassPoints[Math.round(deg / 22.5) % 16];
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
  const { insights: treeInsights, trees } = useTreeInsights();
  const [latest, setLatest] = useState<ConditionsReading | null>(null);
  const [history, setHistory] = useState<ConditionsReading[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [regionalAqi, setRegionalAqi] = useState<RegionalAqi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [conditionsRange, setConditionsRange] = useState<TrendRange>('hour');
  const [rangeRows, setRangeRows] = useState<{ x: string; temp: number | null; humidityPct: number | null }[]>([]);

  // Independent of the 24h `history` fetch above (which stays fixed for the
  // per-metric MiniTrendChart toggles) -- this drives only the big
  // temp/humidity chart below, which owns its own range selector.
  useEffect(() => {
    let cancelled = false;
    const load =
      conditionsRange === 'hour'
        ? fetchConditionsHistory(HOUR_RANGE_WINDOW_HOURS).then((rows) =>
            rows.map((r) => ({ x: r.ts, temp: r.outdoor_temp_c != null ? convertTemp(r.outdoor_temp_c, system) : null, humidityPct: r.humidity_pct }))
          )
        : fetchDailyConditionsHistory(daysForRange(conditionsRange)).then((rows) =>
            rows.map((r) => ({ x: r.date, temp: r.outdoor_temp_avg != null ? convertTemp(r.outdoor_temp_avg, system) : null, humidityPct: r.humidity_avg }))
          );
    load
      .then((rows) => {
        if (!cancelled) setRangeRows(rows);
      })
      .catch(() => {
        if (!cancelled) setRangeRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conditionsRange, system]);

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
  const priorityInsight = treeInsights[0];
  const priorityTree = priorityInsight ? trees.find((t) => t.id === priorityInsight.treeId) : undefined;

  const vpd = latest?.outdoor_temp_c != null && latest?.humidity_pct != null ? vpdKPa(latest.outdoor_temp_c, latest.humidity_pct) : null;
  const demand = vpd !== null ? waterDemandNow(vpd) : null;
  const aqi = latest?.pm25_aqi != null ? aqiCategory(latest.pm25_aqi) : null;
  const heatStress = latest?.wbgt_c != null ? heatStressStatus(latest.wbgt_c) : null;
  const freshness = freshnessLabel(latest?.ts ?? null);

  const chartData = history.map((r) => ({
    hour: new Date(r.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    temp: r.outdoor_temp_c != null ? convertTemp(r.outdoor_temp_c, system) : null,
    humidityPct: r.humidity_pct,
    windSpeed: r.wind_mph != null ? convertWindSpeed(r.wind_mph, system) : null,
    pressure: r.pressure_hpa != null ? convertPressure(r.pressure_hpa, system) : null,
    aqi: r.pm25_aqi,
    blackGlobe: r.black_globe_temp_c != null ? convertTemp(r.black_globe_temp_c, system) : null,
  }));

  const outdoorChart = useChartToggle();
  const windChart = useChartToggle();
  const pressureChart = useChartToggle();
  const aqiChart = useChartToggle();
  const heatChart = useChartToggle();

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
            Couldn't reach the live weather feed right now. Showing whatever data is still available below rather than stale or fabricated numbers.
          </p>
        </Card>
      )}

      <>
          <div className="rgrid-3" style={{ gap: 12 }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">Outdoor</div>
                <ChartToggle open={outdoorChart.open} onClick={outdoorChart.toggle} />
              </div>
              <MetricValue label="Temperature" value={loading ? '—' : formatTemp(latest?.outdoor_temp_c ?? null, system)} unit={tempUnit(system)} tooltip={metricInfo.outdoorTemp} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {loading ? '—' : `${fmt(latest?.humidity_pct ?? null, 0)}% humidity`} · VPD {vpd !== null ? vpd.toFixed(2) : '—'} kPa
                <InfoTooltip text={metricInfo.vpd} />
              </div>
              {outdoorChart.open && <MiniTrendChart data={chartData} dataKey="temp" xKey="hour" color="var(--watch)" unit={tempUnit(system)} />}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">Wind</div>
                <ChartToggle open={windChart.open} onClick={windChart.toggle} />
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
              {windChart.open && <MiniTrendChart data={chartData} dataKey="windSpeed" xKey="hour" color="var(--insight)" unit={windSpeedUnit(system)} />}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">Pressure & rain</div>
                <ChartToggle open={pressureChart.open} onClick={pressureChart.toggle} />
              </div>
              <MetricValue label="Pressure" value={formatPressure(latest?.pressure_hpa ?? null, system)} unit={pressureUnit(system)} tooltip={metricInfo.pressure} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {latest?.rain_in === 0 || latest?.rain_in == null ? 'No rain today' : `${formatRain(latest.rain_in, system)}${rainUnit(system)} today`}
                <InfoTooltip text={metricInfo.rain} />
              </div>
              {pressureChart.open && <MiniTrendChart data={chartData} dataKey="pressure" xKey="hour" color="var(--ok)" unit={pressureUnit(system)} />}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">
                  Air quality
                  <InfoTooltip text={metricInfo.aqi} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {aqi && <StatusBadge status={aqi.status} size="sm" />}
                  <ChartToggle open={aqiChart.open} onClick={aqiChart.toggle} />
                </div>
              </div>
              <MetricValue label="Local AQI" value={loading ? '—' : fmt(latest?.pm25_aqi ?? null, 0)} tooltip={metricInfo.aqi} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {aqi ? aqi.label : '—'} · PM2.5 {loading ? '—' : fmt(latest?.pm25 ?? null, 0)} µg/m³
              </div>
              {aqiChart.open && <MiniTrendChart data={chartData} dataKey="aqi" xKey="hour" color="var(--urgent)" />}
              {regionalAqi?.airnow_aqi != null && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  Regional (AirNow, {regionalAqi.reporting_area}): AQI {regionalAqi.airnow_aqi.toFixed(0)} {regionalAqi.airnow_category}
                  {regionalAqi.discussion && (
                    <Collapsible trigger="Forecast discussion">
                      <p style={{ lineHeight: 1.4 }}>{regionalAqi.discussion}</p>
                    </Collapsible>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="eyebrow">
                  Heat stress
                  <InfoTooltip text={metricInfo.heatStress} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {heatStress && <StatusBadge status={heatStress} size="sm" />}
                  <ChartToggle open={heatChart.open} onClick={heatChart.toggle} />
                </div>
              </div>
              <MetricValue label="Black globe" value={formatTemp(latest?.black_globe_temp_c ?? null, system)} unit={tempUnit(system)} tooltip={metricInfo.blackGlobe} />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                WBGT {formatTemp(latest?.wbgt_c ?? null, system)}{tempUnit(system)}
                <InfoTooltip text={metricInfo.wbgt} />
              </div>
              {heatChart.open && <MiniTrendChart data={chartData} dataKey="blackGlobe" xKey="hour" color="var(--urgent)" unit={tempUnit(system)} />}
            </Card>

            {sunTimes && (
              <Card>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Sun
                </div>
                <MetricValue label="Day length" value={sunTimes.dayLengthHours} unit="h" />
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  Sunrise {sunTimes.sunrise} · Sunset {sunTimes.sunset}
                </div>
              </Card>
            )}
          </div>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div className="eyebrow">Conditions</div>
              <RangeSelector value={conditionsRange} onChange={setConditionsRange} />
            </div>
            {rangeRows.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{loading ? 'Loading…' : emptyMessageForRange(conditionsRange, 'the feed just went live')}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={rangeRows}>
                    <defs>
                      <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--watch)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--watch)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} tickFormatter={formatXForRange(conditionsRange)} minTickGap={40} />
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

          <div className="rgrid-2" style={{ gap: 16 }}>
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

          <EnvironmentalContextPanel latest={latest} regionalAqi={regionalAqi} forecast={forecast} freshnessLabel={freshness.label} />

          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Regional source maps
            </div>
            <Collapsible trigger="Windy & PurpleAir (third-party embeds)">
              <RegionalMaps />
            </Collapsible>
          </div>

          <Card style={{ borderColor: 'var(--insight)' }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--insight)' }}>
              Grove impact
            </div>
            <p style={{ fontSize: 13.5 }}>
              {demand ? `${demand.label} evaporative demand right now (VPD ${vpd?.toFixed(2)} kPa).` : 'Waiting on live data.'}{' '}
              {priorityTree && priorityInsight?.implication
                ? `${priorityTree.name} ${priorityInsight.implication.toLowerCase()}`
                : 'No trees are projected to cross a threshold today.'}
            </p>
          </Card>
        </>
    </div>
  );
}
