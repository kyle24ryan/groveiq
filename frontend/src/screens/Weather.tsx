import { Card } from '../components/Card';
import { currentConditions, forecastNext7Days } from '../data/mockData';

export function Weather() {
  const forecast = forecastNext7Days();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Weather & Ambient</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>North Bend, WA — Zone 8b</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Outdoor temp', value: `${currentConditions.outdoorTempC}°C` },
          { label: 'Humidity', value: `${currentConditions.humidityPct}%` },
          { label: 'Wind', value: `${currentConditions.windMph} mph` },
          { label: 'Rain today', value: `${currentConditions.rainIn} in` },
          { label: 'Black globe', value: `${currentConditions.blackGlobeTempC}°C` },
          { label: 'PM2.5', value: `${currentConditions.pm25} µg/m³` },
        ].map((stat) => (
          <Card key={stat.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: 6 }}>{stat.label}</div>
            <div className="mono" style={{ fontSize: 20 }}>
              {stat.value}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
          7-day forecast
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {forecast.map((day) => (
            <div
              key={day.date}
              style={{
                flex: '0 0 auto',
                minWidth: 96,
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
                textAlign: 'center',
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                {day.date.slice(5)}
              </div>
              <div style={{ fontSize: 15, marginTop: 6 }}>
                {day.highTempF}° / {day.lowTempF}°
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{day.precipChancePct}% rain</div>
              {day.windGustMph > 20 && (
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>Gusts {day.windGustMph}mph</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
