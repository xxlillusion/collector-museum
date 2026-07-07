import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listPublishedShows } from '../../lib/publicShows';
import type { PublicShowSummary, ShowLocationFilter } from '../../lib/publicShows';
import { COUNTRIES, regionOptions, formatLocation } from '../../lib/locations';

const GOLD = '#d4af37';

export const filterSelectStyle: React.CSSProperties = {
  background: '#0d0b0a',
  color: '#e8e0d0',
  border: '1px solid rgba(212,175,55,0.28)',
  borderRadius: 2,
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: "Georgia, 'Times New Roman', serif",
  letterSpacing: '0.04em',
  cursor: 'pointer',
};

export const filterLabelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.14em',
  color: '#8a816d',
  marginRight: 8,
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
    <PageShell title="Card Shows">
      {!isSupabaseConfigured && (
        <p style={noteStyle}>
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

      {isSupabaseConfigured && shows === null && <p style={noteStyle}>Loading shows…</p>}

      {isSupabaseConfigured && shows !== null && shows.length === 0 && (
        <p style={noteStyle}>
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
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  padding: '16px 18px',
                  border: '1px solid #3a352c',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.025)',
                  textDecoration: 'none',
                  color: '#e8e0d0',
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 84,
                    flexShrink: 0,
                    borderRadius: 6,
                    border: '1px solid #4a4436',
                    background: '#0d0b09',
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
                    <span style={{ color: '#5c5546', fontSize: 12, fontStyle: 'italic' }}>
                      no plan
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, color: '#f0e6ce', marginBottom: 4 }}>
                    {s.name}
                    {upcoming && (
                      <span
                        style={{
                          marginLeft: 10,
                          fontSize: 11,
                          letterSpacing: 1.5,
                          color: GOLD,
                          border: `1px solid ${GOLD}`,
                          borderRadius: 4,
                          padding: '2px 7px',
                          verticalAlign: 'middle',
                        }}
                      >
                        UPCOMING
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: '#b7ad98' }}>
                    {formatShowDate(s.showDate) ?? 'Date to be announced'}
                  </div>
                  {location && (
                    <div style={{ fontSize: 13, color: '#b7ad98', marginTop: 2 }}>
                      {location}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#8a816d', marginTop: 4 }}>
                    {s.boothCount} booth{s.boothCount === 1 ? '' : 's'} ·{' '}
                    {s.vendorCount} vendor{s.vendorCount === 1 ? '' : 's'}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

const noteStyle: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.7,
  color: '#b7ad98',
  fontStyle: 'italic',
};
