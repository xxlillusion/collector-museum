import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicCollectorProfile } from '../../lib/publicCollectors';
import type { PublicCollectorProfile } from '../../lib/publicCollectors';
import { cardDetailsLine, hasCardMeta } from '../../lib/cardMeta';
import { orderForWalls, hiddenFromWalls } from '../../lib/wallOrder';
import { fetchWalks } from '../../lib/visitService';
import { formatLocation } from '../../lib/locations';
import { Section, useTheme } from '../../components/themeKit';
import { LCD, LcdDialog, lcdWell } from '../../components/lcdKit';

// Public collector profile page (/collector/:id) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicCollectors.ts
// (direct Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  const t = useTheme();
  return <p style={{ ...t.note, fontSize: t.id === 'handheld' ? 11 : 16 }}>{children}</p>;
}

// ---------------------------------------------------------------- handheld
// COLLECTOR CARD helpers (pure, no deps).

/** Stable 5-digit "ID No." from the collector's uuid — tiny hash mod 100000. */
function collectorIdNo(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(h % 100000).padStart(5, '0');
}

/** Avatar initials — first letters of the first two words. */
function collectorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
}

/** Badge stars from public card count: 1/10/25/50/100 → ★ filled of 5. */
function badgeStars(count: number): string {
  const filled =
    count >= 100 ? 5 : count >= 50 ? 4 : count >= 25 ? 3 : count >= 10 ? 2 : count >= 1 ? 1 : 0;
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ready'; profile: PublicCollectorProfile };

export default function CollectorPage({ profileId }: { profileId: string }) {
  const t = useTheme();
  const [, navigate] = useLocation();
  const lcd = t.id === 'handheld';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Anonymous walk counter (0007) — null on any failure hides the line.
  const [walks, setWalks] = useState<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicCollectorProfile(profileId).then((profile) => {
      if (cancelled) return;
      setState(profile ? { status: 'ready', profile } : { status: 'notFound' });
    });
    setWalks(null);
    fetchWalks('collector', profileId).then((n) => {
      if (!cancelled) setWalks(n);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (!isSupabaseConfigured) {
    return (
      <PageShell title="Collector" eyebrow="PRIVATE GALLERY">
        {lcd ? (
          <LcdDialog cursor>
            ! NO LINK CABLE! COLLECTOR PAGES NEED A CLOUD CONNECTION — THIS MACHINE
            RUNS IN GUEST MODE.
          </LcdDialog>
        ) : (
          <Note>
            This gallery is running in guest mode — public collector profiles need the cloud
            connection, which isn't configured here.
          </Note>
        )}
      </PageShell>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageShell title="Collector" eyebrow="PRIVATE GALLERY">
        <Note>Polishing the display case…</Note>
      </PageShell>
    );
  }

  if (state.status === 'notFound') {
    return (
      <PageShell title="Collector" eyebrow="PRIVATE GALLERY">
        {lcd ? (
          <LcdDialog
            choices={[{ label: 'GO HOME', primary: true, onClick: () => navigate('/') }]}
          >
            ! NO COLLECTOR BY THAT NAME LIVES HERE! THE LINK MAY BE WRONG.
          </LcdDialog>
        ) : (
          <>
            <Note>Collector not found.</Note>
            <p style={{ marginTop: 24 }}>
              <Link
                href="/"
                style={{
                  color: t.accent,
                  textDecoration: 'none',
                  fontFamily: t.fontMono,
                  fontSize: 12.5,
                  letterSpacing: '0.18em',
                }}
              >
                RETURN TO THE MUSEUM →
              </Link>
            </p>
          </>
        )}
      </PageShell>
    );
  }

  const { profile } = state;
  const location = formatLocation(profile);
  const bio = profile.bio.trim();

  // Grid follows the curated wall order, then the binder-only items (the
  // public grid shows the whole public collection — the walls are just the
  // exhibit, so no dimming here). Index-based addedAt feeds the tiebreak.
  const indexed = profile.items.map((item, i) => ({ ...item, addedAt: i }));
  const orderedItems = [...orderForWalls(indexed), ...hiddenFromWalls(indexed)];

  const collectionGrid = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 22,
        alignItems: 'start',
      }}
    >
      {orderedItems.map((item) => (
        <figure key={item.id} className="museum-lift" style={{ margin: 0 }}>
          <img
            src={item.imageUrl}
            alt={item.name || 'Collection card'}
            loading="lazy"
            style={{
              width: '100%',
              aspectRatio: String(item.aspect),
              objectFit: 'cover',
              display: 'block',
              background: t.surface,
              ...t.cardFrame,
            }}
          />
          {/* Name only once the owner set placard metadata — same gate
              as App.tsx's museum captions, so raw upload filenames
              never reach the public grid. */}
          {((item.name && hasCardMeta(item.meta)) || cardDetailsLine(item.meta)) &&
            (lcd ? (
              <figcaption
                style={{
                  marginTop: 7,
                  fontFamily: t.fontMono,
                  fontSize: 9,
                  lineHeight: 1.7,
                  color: LCD.muted,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {item.name && hasCardMeta(item.meta) && (
                  <span style={{ display: 'block', color: LCD.ink }}>{item.name}</span>
                )}
                {cardDetailsLine(item.meta) && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: item.name && hasCardMeta(item.meta) ? 2 : 0,
                    }}
                  >
                    {cardDetailsLine(item.meta)}
                  </span>
                )}
              </figcaption>
            ) : (
              <figcaption
                style={{
                  marginTop: 10,
                  fontFamily: t.fontMono,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: t.muted,
                  textAlign: 'center',
                }}
              >
                {item.name && hasCardMeta(item.meta) && (
                  <span style={{ fontStyle: t.id === 'refined' ? 'italic' : 'normal' }}>
                    {item.name}
                  </span>
                )}
                {cardDetailsLine(item.meta) && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: item.name && hasCardMeta(item.meta) ? 4 : 0,
                      fontSize: 11.5,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {cardDetailsLine(item.meta)}
                  </span>
                )}
              </figcaption>
            ))}
        </figure>
      ))}
    </div>
  );

  return (
    <PageShell title={profile.displayName || 'Collector'} eyebrow="PRIVATE GALLERY">
      {lcd ? (
        <div
          style={{
            border: `3px solid ${LCD.ink}`,
            background: LCD.panel,
            maxWidth: 560,
            margin: '0 auto 36px',
            fontFamily: t.fontMono,
            color: LCD.ink,
          }}
        >
          {/* header row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              padding: '8px 12px',
              borderBottom: `2px solid ${LCD.ink}`,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ fontWeight: 700 }}>COLLECTOR CARD</span>
            <span>ID No. {collectorIdNo(profile.id)}</span>
          </div>
          {/* avatar + name/bio */}
          <div style={{ display: 'flex', gap: 14, padding: '12px 12px 10px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: 64,
                height: 64,
                flexShrink: 0,
                border: `3px solid ${LCD.ink}`,
                background: LCD.mid,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {collectorInitials(profile.displayName || 'Collector')}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {profile.displayName || 'COLLECTOR'}
              </div>
              {location && (
                <div
                  style={{
                    fontSize: 9,
                    color: LCD.muted,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginTop: 3,
                  }}
                >
                  {location}
                </div>
              )}
              {bio && (
                <div style={{ fontSize: 10, lineHeight: 1.9, marginTop: 6, textTransform: 'uppercase' }}>
                  {bio}
                </div>
              )}
            </div>
          </div>
          {/* stats row */}
          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              padding: '8px 12px',
              borderTop: `2px solid ${LCD.mid}`,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span>
              <span style={{ color: LCD.muted }}>CARDS </span>
              <span style={{ fontWeight: 700 }}>{profile.items.length}</span>
            </span>
            <span>
              <span style={{ color: LCD.muted }}>WALKS </span>
              <span style={{ fontWeight: 700 }}>{walks !== null && walks >= 1 ? walks : '-'}</span>
            </span>
            <span>
              <span style={{ color: LCD.muted }}>BADGES </span>
              <span style={{ fontWeight: 700, letterSpacing: '0.1em' }}>
                {badgeStars(profile.items.length)}
              </span>
            </span>
          </div>
          {/* actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px 12px' }}>
            {profile.collectionPublic && profile.items.length > 0 && (
              <Link
                href={`/museum/collector/${profile.id}`}
                style={{
                  ...t.primaryButton,
                  display: 'inline-block',
                  textDecoration: 'none',
                  padding: '10px 16px',
                  fontSize: 10.5,
                }}
              >
                ▶ WALK THE MUSEUM
              </Link>
            )}
            <ShareButton />
          </div>
        </div>
      ) : (
        <>
          {location && (
            <div
              style={{
                margin: '-18px 0 26px',
                textAlign: 'center',
                fontFamily: t.fontMono,
                fontSize: 14.5,
                color: t.muted,
                letterSpacing: '0.08em',
              }}
            >
              {location}
            </div>
          )}

          {bio && (
            <p
              style={{
                fontFamily: t.fontMono,
                fontSize: 15.5,
                lineHeight: 1.8,
                color: t.text,
                margin: '0 auto 36px',
                maxWidth: 640,
                textAlign: 'center',
              }}
            >
              {bio}
            </p>
          )}
        </>
      )}

      <Section title="THE COLLECTION">
        {!profile.collectionPublic ? (
          lcd ? (
            <LcdDialog cursor>THIS COLLECTION IS PRIVATE!</LcdDialog>
          ) : (
            <Note>This collection is private.</Note>
          )
        ) : profile.items.length === 0 ? (
          lcd ? (
            <LcdDialog cursor>THIS COLLECTOR HASN'T HUNG ANY CARDS YET!</LcdDialog>
          ) : (
            <Note>Nothing on display yet — check back soon.</Note>
          )
        ) : (
          <>
            {/* Handheld: the COLLECTOR CARD above owns the walk action. */}
            {!lcd && (
              <Link
                href={`/museum/collector/${profile.id}`}
                style={{
                  ...t.primaryButton,
                  display: 'inline-block',
                  textDecoration: 'none',
                  marginBottom: 26,
                }}
              >
                WALK THE MUSEUM →
              </Link>
            )}
            {!lcd && walks !== null && walks >= 1 && (
              <p style={{ ...t.note, fontSize: 12.5, margin: '-14px 0 26px' }}>
                {walks} museum walk{walks === 1 ? '' : 's'}
              </p>
            )}
            {lcd ? <div style={lcdWell}>{collectionGrid}</div> : collectionGrid}
          </>
        )}
      </Section>

      {/* Handheld mounts ShareButton inside the COLLECTOR CARD actions. */}
      {!lcd && (
        <div style={{ marginTop: 10 }}>
          <ShareButton />
        </div>
      )}
    </PageShell>
  );
}
