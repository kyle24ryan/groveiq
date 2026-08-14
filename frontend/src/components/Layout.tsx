import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { trees, insightFor } from '../data/mockData';

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/trees', label: 'Trees' },
  { to: '/environment', label: 'Environment' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/insights', label: 'Intelligence' },
];

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '10px 10px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: 500,
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  background: isActive ? 'var(--surface)' : 'transparent',
  textDecoration: 'none',
  display: 'block',
});

// Below 768px the fixed 232px sidebar (spec 11's mobile requirement: "must
// not remain a fixed sidebar") becomes an off-canvas drawer toggled by a
// top bar, driven by the .groveiq-sidebar/.groveiq-sidebar-backdrop CSS in
// theme.css. Desktop/tablet keep the always-visible sidebar unchanged.
export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <div className={`groveiq-sidebar-backdrop${mobileOpen ? ' open' : ''}`} onClick={closeMobile} aria-hidden="true" />
      <aside className={`groveiq-sidebar${mobileOpen ? ' open' : ''}`} style={sidebarStyle}>
        <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>GroveIQ</div>
            <div className="eyebrow" style={{ marginTop: 2 }}>
              Grove Collection
            </div>
          </div>
          <button
            className="groveiq-sidebar-close"
            onClick={closeMobile}
            aria-label="Close navigation"
            style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 20, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} style={linkStyle} onClick={closeMobile}>
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
                onClick={closeMobile}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 8px',
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

        <NavLink to="/settings" style={linkStyle} onClick={closeMobile}>
          Settings
        </NavLink>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="groveiq-topbar">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 20, cursor: 'pointer' }}
          >
            ☰
          </button>
          <span style={{ fontSize: 15, fontWeight: 700 }}>GroveIQ</span>
          <span className={`status-dot status-${worstCollectionStatus()}`} style={{ marginLeft: 'auto', width: 44, textAlign: 'center' }} aria-hidden="true" />
        </div>
        <main className="groveiq-main" style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const sidebarStyle = {
  width: 232,
  flexShrink: 0,
  background: 'var(--sidebar)',
  borderRight: '1px solid var(--border)',
  padding: '20px 14px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 20,
};

// Worst status across the whole collection, for the top-bar dot on mobile
// where the full sidebar (with its per-tree dots) is collapsed away.
function worstCollectionStatus(): 'ok' | 'watch' | 'urgent' {
  const rank: Record<'ok' | 'watch' | 'urgent', number> = { urgent: 0, watch: 1, ok: 2 };
  let worst: 'ok' | 'watch' | 'urgent' = 'ok';
  for (const tree of trees) {
    const status = insightFor(tree.id).status;
    if (rank[status] < rank[worst]) worst = status;
  }
  return worst;
}
