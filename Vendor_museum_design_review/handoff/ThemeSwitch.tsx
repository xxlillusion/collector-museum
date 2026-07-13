import { THEMES, useThemeSwitch } from './themeKit';
import type { ThemeId } from './themeKit';

/**
 * Beta theme switcher — a small segmented pill. Drop it next to the account
 * pill in PageShell / HomeScreen corner chrome, or in the Account page.
 * Persists via themeKit's localStorage key; no other wiring needed.
 */
export default function ThemeSwitch() {
  const { theme, themeId, setThemeId } = useThemeSwitch();
  const ids = Object.keys(THEMES) as ThemeId[];
  return (
    <div
      role="radiogroup"
      aria-label="Interface style (beta)"
      style={{
        display: 'flex',
        gap: 2,
        padding: 3,
        border: `${theme.borderWidth}px solid ${theme.border}`,
        borderRadius: 999,
        background: theme.surface,
      }}
    >
      {ids.map((id) => {
        const active = id === themeId;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            title={THEMES[id].label}
            onClick={() => setThemeId(id)}
            style={{
              background: active ? theme.accent : 'transparent',
              color: active ? theme.accentContrast : theme.muted,
              border: 'none',
              borderRadius: 999,
              padding: '6px 12px',
              fontFamily: theme.fontMono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.14em',
              cursor: 'pointer',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {THEMES[id].label}
          </button>
        );
      })}
    </div>
  );
}
