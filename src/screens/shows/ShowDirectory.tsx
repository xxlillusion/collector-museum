import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listPublishedShows } from '../../lib/publicShows';
import type { PublicShowSummary } from '../../lib/publicShows';

const GOLD = '#d4af37';

export function formatShowDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// Owned by the shows workstream (Stream C).
export default function ShowDirectory() {
  const [shows, setShows] = useState<PublicShowSummary[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setShows([]);
      return;
    }
    let alive = true;
    listPublishedShows().then((s) => {
      if (alive) setShows(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell title="Card Shows">
      {!isSupabaseConfigured && (
        <p style={noteStyle}>
          The shows directory needs a configured backend — this deployment runs in
          guest-only mode. You can still build and walk floor plans from the home screen.
        </p>
      )}

      {isSupabaseConfigured && shows === null && <p style={noteStyle}>Loading shows…</p>}

      {isSupabaseConfigured && shows !== null && shows.length === 0 && (
        <p style={noteStyle}>No shows published yet — check back soon.</p>
      )}

      {shows !== null && shows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shows.map((s) => {
            const upcoming = s.showDate !== null && s.showDate >= today;
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
