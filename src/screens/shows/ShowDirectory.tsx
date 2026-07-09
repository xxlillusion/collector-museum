import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import SearchBox from '../../components/SearchBox';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listPublishedShows } from '../../lib/publicShows';
import type { PublicShowSummary, ShowLocationFilter } from '../../lib/publicShows';
import { COUNTRIES, regionOptions, formatLocation } from '../../lib/locations';
import {
  GOLD, HAIRLINE, TEXT, MUTED, PANEL, SERIF,
  inputStyle, labelStyle, noteStyle,
} from '../../components/museumKit';

/** Museum-styled inline select for the filter row (also used by /vendors). */
export const filterSelectStyle: CSSProperties = {
  ...inputStyle,
  display: 'inline-block',
  width: 'auto',
  fontSize: 13,
  padding: '8px 12px',
  cursor: 'pointer',
};

export const filterLabelStyle: CSSProperties = {
  ...labelStyle,
  display: 'inline-block',
  margin: '0 8px 0 0',
};

export function formatShowDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// Owned by the shows workstream (Stream C).
export default function ShowDirectory() {
  const [shows, setShows] = useState<PublicShowSummary[] | null>(null);
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');

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

  return (
    <PageShell title="Card Shows" eyebrow="PUBLIC EXHIBITIONS">
      {!isSupabaseConfigured && (
        <p style={{ ...noteStyle, fontSize: 16 }}>
          The shows directory needs a configured backend — this deployment runs in
          guest-only mode. You can still build and walk floor plans from the home screen.
        </p>
      )}

      {isSupabaseConfigured && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 18,
            marginBottom: 26,
          }}
        >
          <SearchBox width={280} />
          <div>
            <span style={filterLabelStyle}>COUNTRY</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setState('');
              }}
              style={filterSelectStyle}
            >
              <option value="">All countries</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {regions.length > 0 && (
            <div>
              <span style={filterLabelStyle}>{country === 'CA' ? 'PROVINCE' : 'STATE'}</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={filterSelectStyle}
              >
                <option value="">All</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {isSupabaseConfigured && shows === null && (
        <p style={{ ...noteStyle, fontSize: 16 }}>Loading shows…</p>
      )}

      {isSupabaseConfigured && shows !== null && shows.length === 0 && (
        <p style={{ ...noteStyle, fontSize: 16 }}>
          {filtered
            ? 'No shows in this area yet — try widening the search.'
            : 'No shows published yet — check back soon.'}
        </p>
      )}

      {shows !== null && shows.length > 0 && (
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
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 4,
                  background: PANEL,
                  textDecoration: 'none',
                  color: TEXT,
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 84,
                    flexShrink: 0,
                    borderRadius: 2,
                    border: `1px solid ${HAIRLINE}`,
                    background: '#0d0b0a',
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
                    <span style={{ fontFamily: SERIF, fontStyle: 'italic', color: MUTED, fontSize: 12 }}>
                      no plan
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: 19,
                      letterSpacing: '0.06em',
                      color: TEXT,
                      marginBottom: 5,
                    }}
                  >
                    {s.name}
                    {upcoming && (
                      <span
                        style={{
                          marginLeft: 10,
                          fontFamily: SERIF,
                          fontSize: 10,
                          letterSpacing: '0.2em',
                          color: GOLD,
                          border: `1px solid ${HAIRLINE}`,
                          borderRadius: 2,
                          padding: '2px 8px',
                          verticalAlign: 'middle',
                        }}
                      >
                        UPCOMING
                      </span>
                    )}
                  </div>
                  <div style={{ ...noteStyle, fontSize: 13.5, lineHeight: 1.55 }}>
                    {formatShowDate(s.showDate) ?? 'Date to be announced'}
                  </div>
                  {location && (
                    <div style={{ ...noteStyle, fontSize: 13, lineHeight: 1.55 }}>
                      {location}
                    </div>
                  )}
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', color: MUTED, marginTop: 6 }}>
                    {s.boothCount} BOOTH{s.boothCount === 1 ? '' : 'S'} ·{' '}
                    {s.vendorCount} VENDOR{s.vendorCount === 1 ? '' : 'S'}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: GOLD,
                    whiteSpace: 'nowrap',
                  }}
                >
                  VIEW →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
