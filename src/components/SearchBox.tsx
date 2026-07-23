import { useState } from 'react';
import { useLocation } from 'wouter';
import { useTheme } from './themeKit';

// Museum-styled search entry: submits to /search?q=… (the SearchScreen owns
// the actual querying). Lives on the landing page and both directories.
// Handheld: the input flows LCD tokens (3px ink border, Silkscreen); the
// submit button becomes a bold ▶ chip.
export default function SearchBox({
  initialQuery = '',
  autoFocus = false,
  width = 340,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  /** Max width — the box shrinks with the viewport below this. */
  width?: number;
}) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState(initialQuery);
  const t = useTheme();
  const lcd = t.id === 'handheld';

  const submit = () => {
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        width: '100%',
        maxWidth: width,
        alignItems: 'stretch',
      }}
    >
      <input
        type="search"
        placeholder={lcd ? 'SEARCH SHOWS, VENDORS, CARDS…' : 'Search shows, vendors, cards…'}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{ ...t.input, flex: 1, minWidth: 0 }}
      />
      <button
        onClick={submit}
        title="Search"
        aria-label="Search"
        style={lcd ? {
          background: t.panel,
          border: `3px solid ${t.border}`,
          borderRadius: 0,
          color: q.trim() ? t.text : t.muted,
          fontFamily: t.fontMono,
          fontWeight: 700,
          fontSize: 12,
          padding: '0 12px',
          cursor: 'pointer',
        } : {
          background: 'transparent',
          border: `${t.borderWidth}px solid ${t.border}`,
          borderRadius: 2,
          color: q.trim() ? t.accent : t.muted,
          fontSize: 16,
          padding: '0 14px',
          cursor: 'pointer',
        }}
      >
        {lcd ? '▶' : '⌕'}
      </button>
    </div>
  );
}
