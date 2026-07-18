import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import SearchBox from '../../components/SearchBox';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listPublishedShows } from '../../lib/publicShows';
import type { PublicShowSummary, ShowLocationFilter } from '../../lib/publicShows';
import { COUNTRIES, regionOptions, regionName, formatLocation } from '../../lib/locations';
import { useTheme } from '../../components/themeKit';
import type { Theme } from '../../components/themeKit';
import { LcdCursor, LcdDialog, lcdMenuBox, lcdMenuRow } from '../../components/lcdKit';

/** Themed inline select for the filter row (also used by /vendors) — call
 *  with the active theme from useTheme(). Handheld renders it chip-weight
 *  (panel bg, bold) — the ▼ suffix is added by the host's chip wrapper. */
export const filterSelectStyle = (t: Theme): CSSProperties => ({
  ...t.input,
  display: 'inline-block',
  width: 'auto',
  fontSize: t.id === 'handheld' ? 10.5 : 13,
  padding: t.id === 'handheld' ? '7px 10px' : '8px 12px',
  cursor: 'pointer',
  ...(t.id === 'handheld' ? { background: t.panel, fontWeight: 700 } : {}),
});

export const filterLabelStyle = (t: Theme): CSSProperties => ({
  ...t.label,
  display: 'inline-block',
  margin: '0 8px 0 0',
});

export function formatShowDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Handheld menu-row date: "AUG 02" (or "TBA"). */
function lcdShowDate(iso: string | null): string {
  if (!iso) return 'TBA';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
}

/** Handheld-only: ink-border chip wrapping a native select with a ▼ suffix
 *  ("AREA: WASHINGTON ▼" feel) — the select keeps full function. */
function LcdSelectChip({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ ...filterLabelStyle(t), margin: '0 6px 0 0' }}>{label}</span>
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...filterSelectStyle(t),
            appearance: 'none',
            WebkitAppearance: 'none',
            paddingRight: 26,
          }}
        >
          {children}
        </select>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 9,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            fontSize: 8,
            fontWeight: 700,
            color: t.text,
            fontFamily: t.fontMono,
          }}
        >
          ▼
        </span>
      </span>
    </label>
  );
}

// Owned by the shows workstream (Stream C).
export default function ShowDirectory() {
  const t = useTheme();
  const [, navigate] = useLocation();
  const [shows, setShows] = useState<PublicShowSummary[] | null>(null);
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  // Handheld menu rows: hover/focus = inversion (never hue), tracked here.
  const [hotRow, setHotRow] = useState<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setShows([]);
      return;
    }
    let alive = true;
    setShows(null);
    const filter: ShowLocationFilter | undefined = country
      ? { country, ...(state ? { state } : {}) }
      : undefined;
    listPublishedShows(filter).then((s) => {
      if (alive) setShows(s);
    });
    return () => {
      alive = false;
    };
  }, [country, state]);

  const today = new Date().toISOString().slice(0, 10);
  const regions = regionOptions(country || null);
  const filtered = Boolean(country || state);
  const lcd = t.id === 'handheld';

  return (
    <PageShell title="Card Shows" eyebrow="PUBLIC EXHIBITIONS">
      {!isSupabaseConfigured && (lcd ? (
        <LcdDialog cursor style={{ maxWidth: 520, margin: '0 auto' }}>
          NO SHOW DIRECTORY HERE — THIS BUILD RUNS OFFLINE! YOU CAN STILL BUILD
          AND WALK YOUR OWN SHOW FROM THE HOME SCREEN!
        </LcdDialog>
      ) : (
        <p style={{ ...t.note, fontSize: 16 }}>
          The shows directory needs a configured backend — this deployment runs in
          guest-only mode. You can still build and walk floor plans from the home screen.
        </p>
      ))}

      {isSupabaseConfigured && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: lcd ? 14 : 18,
            marginBottom: 26,
          }}
        >
          <SearchBox width={280} />
          {lcd ? (
            <LcdSelectChip
              label="COUNTRY"
              value={country}
              onChange={(v) => {
                setCountry(v);
                setState('');
              }}
            >
              <option value="">All countries</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </LcdSelectChip>
          ) : (
            <div>
              <span style={filterLabelStyle(t)}>COUNTRY</span>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setState('');
                }}
                style={filterSelectStyle(t)}
              >
                <option value="">All countries</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {regions.length > 0 && (lcd ? (
            <LcdSelectChip
              label={country === 'CA' ? 'PROVINCE' : 'STATE'}
              value={state}
              onChange={setState}
            >
              <option value="">All</option>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </LcdSelectChip>
          ) : (
            <div>
              <span style={filterLabelStyle(t)}>{country === 'CA' ? 'PROVINCE' : 'STATE'}</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={filterSelectStyle(t)}
              >
                <option value="">All</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {isSupabaseConfigured && shows === null && (
        <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>Loading shows…</p>
      )}

      {isSupabaseConfigured && shows !== null && shows.length === 0 && (lcd ? (
        <LcdDialog
          cursor
          style={{ maxWidth: 520, margin: '0 auto' }}
          choices={filtered ? undefined : [
            { label: 'WALK THE DEMO SHOW', onClick: () => navigate('/demo'), primary: true },
          ]}
        >
          {filtered
            ? 'NO SHOWS IN THIS AREA YET! TRY WIDENING THE SEARCH!'
            : 'NO SHOWS PUBLISHED YET! WANT TO WALK THE DEMO SHOW?'}
        </LcdDialog>
      ) : (
        <>
          <p style={{ ...t.note, fontSize: 16 }}>
            {filtered
              ? 'No shows in this area yet — try widening the search.'
              : 'No shows published yet — check back soon.'}
          </p>
          {!filtered && (
            // UX Wave A (Stream A1): empty directory still offers the bundled
            // demo hall, so first visitors always have something to walk.
            <p style={{ marginTop: 18 }}>
              <Link
                href="/demo"
                style={{
                  ...t.ghostButton,
                  display: 'inline-block',
                  textDecoration: 'none',
                }}
              >
                {'WALK THE DEMO SHOW →'}
              </Link>
            </p>
          )}
        </>
      ))}

      {shows !== null && shows.length > 0 && (lcd ? (
        // Handheld: the directory is a MENU — rows invert on hover/focus,
        // meta reads "AUG 02 · SEATTLE · 50 BOOTHS · MAP OK!".
        <div style={lcdMenuBox}>
          {shows.map((s, i) => {
            const upcoming = s.showDate !== null && s.showDate >= today;
            const hot = hotRow === i;
            const place = s.city || regionName(s.country, s.state);
            const meta = [
              lcdShowDate(s.showDate),
              place,
              `${s.boothCount} BOOTH${s.boothCount === 1 ? '' : 'S'}`,
              s.planImageUrl ? 'MAP OK!' : 'NO MAP YET',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Link
                key={s.id}
                href={`/show/${s.id}`}
                onMouseEnter={() => setHotRow(i)}
                onMouseLeave={() => setHotRow((c) => (c === i ? null : c))}
                onFocus={() => setHotRow(i)}
                onBlur={() => setHotRow((c) => (c === i ? null : c))}
                style={{
                  ...lcdMenuRow(hot),
                  textDecoration: 'none',
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                }}
              >
                <LcdCursor active={hot} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 700,
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name}
                    {upcoming && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '0 5px',
                          fontSize: 8.5,
                          fontWeight: 700,
                          border: `2px solid ${hot ? t.accentContrast : t.text}`,
                          color: hot ? t.accentContrast : t.text,
                        }}
                      >
                        UPCOMING
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 3,
                      fontSize: 9.5,
                      fontWeight: 400,
                      color: hot ? t.accentContrast : t.muted,
                    }}
                  >
                    {meta}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shows.map((s) => {
            const upcoming = s.showDate !== null && s.showDate >= today;
            const location = formatLocation(s);
            return (
              <Link
                key={s.id}
                href={`/show/${s.id}`}
                className="museum-row"
                style={{
                  display: 'flex',
                  gap: 20,
                  alignItems: 'center',
                  padding: '16px 18px',
                  border: `${t.borderWidth}px solid ${t.border}`,
                  borderRadius: 4,
                  background: t.panel,
                  textDecoration: 'none',
                  color: t.text,
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 84,
                    flexShrink: 0,
                    borderRadius: 2,
                    border: `${t.borderWidth}px solid ${t.border}`,
                    background: t.surface,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {s.planImageUrl ? (
                    <img
                      src={s.planImageUrl}
                      alt={`${s.name} floor plan`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ ...t.note, fontSize: 12, lineHeight: 'normal' }}>
                      no plan
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: t.fontDisplay,
                      fontSize: 19,
                      letterSpacing: '0.06em',
                      color: t.text,
                      marginBottom: 5,
                    }}
                  >
                    {s.name}
                    {upcoming && (
                      <span
                        style={{
                          ...t.chip,
                          marginLeft: 10,
                          verticalAlign: 'middle',
                        }}
                      >
                        UPCOMING
                      </span>
                    )}
                  </div>
                  <div style={{ ...t.note, fontSize: 13.5, lineHeight: 1.55 }}>
                    {formatShowDate(s.showDate) ?? 'Date to be announced'}
                  </div>
                  {location && (
                    <div style={{ ...t.note, fontSize: 13, lineHeight: 1.55 }}>
                      {location}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      color: t.muted,
                      marginTop: 6,
                      fontFamily: t.id === 'refined' ? undefined : t.fontMono,
                    }}
                  >
                    {s.boothCount} BOOTH{s.boothCount === 1 ? '' : 'S'} ·{' '}
                    {s.vendorCount} VENDOR{s.vendorCount === 1 ? '' : 'S'}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: t.accent,
                    whiteSpace: 'nowrap',
                  }}
                >
                  VIEW →
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </PageShell>
  );
}
