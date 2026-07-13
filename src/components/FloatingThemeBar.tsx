import { useEffect, useState } from 'react';
import { THEMES, useThemeSwitch, withAlpha } from './themeKit';
import type { ThemeId } from './themeKit';

/**
 * The beta design switcher — a floating pill bar, mounted once at the app
 * root (main.tsx) so it rides above every screen, DOM and 3D alike.
 *
 * - Short labels (the full theme names are title tooltips).
 * - Collapses to a small ◐ chip (remembered per tab via sessionStorage).
 * - Hides entirely while pointer lock is active — the cursor can't reach it
 *   anyway, and it would sit over the first-person HUD hints.
 * - zIndex 90: above HUD/minimap/directory (≤50), below InspectOverlay (100).
 */

const SHORT: Record<ThemeId, string> = { refined: 'REFINED', night: 'NIGHT', lobby: 'LOBBY' };
const COLLAPSE_KEY = 'vendor-museum:themebar-min';

export default function FloatingThemeBar() {
  const { theme: t, themeId, setThemeId } = useThemeSwitch();
  const [locked, setLocked] = useState(false);
  const [min, setMin] = useState(() => {
    try { return sessionStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement != null);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);
  if (locked) return null;

  const setMinimized = (v: boolean) => {
    try { sessionStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* private mode */ }
    setMin(v);
  };

  const shell = {
    position: 'fixed' as const,
    bottom: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    background: withAlpha('#0b0a09', 0.88),
    border: `1px solid ${t.border}`,
    borderRadius: 999,
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
  };

  if (min) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Interface style (beta)"
        aria-label="Expand the interface-style switcher"
        style={{
          ...shell,
          width: 30,
          height: 30,
          justifyContent: 'center',
          color: t.accent,
          fontSize: 14,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        ◐
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Interface style (beta)" style={{ ...shell, gap: 2, padding: '3px 4px' }}>
      <span
        style={{
          color: t.muted,
          fontFamily: t.fontMono,
          fontSize: 9,
          letterSpacing: '0.18em',
          padding: '0 6px 0 8px',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        ◐ STYLE
      </span>
      {(Object.keys(THEMES) as ThemeId[]).map((id) => {
        const active = id === themeId;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            title={THEMES[id].name}
            onClick={() => setThemeId(id)}
            style={{
              background: active ? t.accent : 'transparent',
              color: active ? t.accentContrast : t.muted,
              border: 'none',
              borderRadius: 999,
              padding: '5px 10px',
              fontFamily: t.fontMono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {SHORT[id]}
          </button>
        );
      })}
      <button
        onClick={() => setMinimized(true)}
        title="Collapse"
        aria-label="Collapse the interface-style switcher"
        style={{
          background: 'transparent',
          color: t.muted,
          border: 'none',
          borderRadius: 999,
          padding: '5px 8px',
          fontSize: 10,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        —
      </button>
    </div>
  );
}
