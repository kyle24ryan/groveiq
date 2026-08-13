import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 210;

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, 8), window.innerWidth - TOOLTIP_WIDTH - 8);
    setCoords({ top: rect.top - 8, left });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 5, verticalAlign: 'middle' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="What this means"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          border: '1px solid var(--border-strong)',
          background: 'transparent',
          color: 'var(--ink-faint)',
          fontSize: 9,
          lineHeight: 1,
          padding: 0,
          cursor: 'help',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
        }}
      >
        i
      </button>
      {open &&
        coords &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translateY(-100%)',
              width: TOOLTIP_WIDTH,
              padding: '8px 10px',
              background: 'var(--ink)',
              color: 'var(--canvas)',
              fontSize: 11.5,
              lineHeight: 1.45,
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 'normal',
              borderRadius: 8,
              zIndex: 1000,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
