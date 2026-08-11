import { NavLink, Outlet } from 'react-router-dom';
import { GrowthRing } from './GrowthRing';

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/species', label: 'Species' },
  { to: '/time-machine', label: 'Time Machine' },
  { to: '/weather', label: 'Weather' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
          <GrowthRing size={28} rings={4} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, lineHeight: 1 }}>GroveIQ</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>Grove Collection</div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '8px 8px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
                background: isActive ? 'var(--paper)' : 'transparent',
                textDecoration: 'none',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
