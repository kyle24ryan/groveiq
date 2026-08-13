import { useState, type ReactNode } from 'react';

export function Collapsible({ trigger, children, defaultOpen = false }: { trigger: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--insight)',
          fontSize: 11.5,
          fontWeight: 500,
          cursor: 'pointer',
        }}
        aria-expanded={open}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
        {open ? 'Hide details' : trigger}
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
