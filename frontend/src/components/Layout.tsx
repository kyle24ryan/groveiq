import { NavLink, Outlet } from 'react-router-dom';
import { trees, insightFor } from '../data/mockData';

const navItems = [
  { to: '/', label: 'Grove', end: true },
  { to: '/trees', label: 'Trees' },
  { to: '/environment', label: 'Environment' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/insights', label: 'Insights' },
];

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '7px 10px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: 500,
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  background: isActive ? 'var(--surface)' : 'transparent',
  textDecoration: 'none',
  display: 'block',
});

export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--border)',
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ padding: '0 8px' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>GroveIQ</div>
          <div className="eyebrow" style={{ marginTop: 2 }}>
            Grove Collection
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} style={linkStyle}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="eyebrow" style={{ padding: '0 8px' }}>
            Collection
          </div>
          {trees.map((tree) => {
            const insight = insightFor(tree.id);
            return (
              <NavLink
                key={tree.id}
                to={`/trees/${tree.id}`}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 8,
                  fontSize: 13,
                  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
                  background: isActive ? 'var(--surface)' : 'transparent',
                  textDecoration: 'none',
                })}
              >
                <span className={`status-dot status-${insight.status}`} aria-label={insight.status} title={insight.status} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tree.name}</span>
              </NavLink>
            );
          })}
        </div>

        <NavLink to="/settings" style={linkStyle}>
          Settings
        </NavLink>
      </aside>
      <main style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
