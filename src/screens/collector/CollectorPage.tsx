import { useEffect, useState } from 'react';
import { Link } from 'wouter';
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

// Public collector profile page (/collector/:id) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicCollectors.ts
// (direct Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  const t = useTheme();
  return <p style={{ ...t.note, fontSize: 16 }}>{children}</p>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ready'; profile: PublicCollectorProfile };

export default function CollectorPage({ profileId }: { profileId: string }) {
  const t = useTheme();
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
        <Note>
          This gallery is running in guest mode — public collector profiles need the cloud
          connection, which isn't configured here.
        </Note>
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

  return (
    <PageShell title={profile.displayName || 'Collector'} eyebrow="PRIVATE GALLERY">
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

      <Section title="THE COLLECTION">
        {!profile.collectionPublic ? (
          <Note>This collection is private.</Note>
        ) : profile.items.length === 0 ? (
          <Note>Nothing on display yet — check back soon.</Note>
        ) : (
          <>
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
            {walks !== null && walks >= 1 && (
              <p style={{ ...t.note, fontSize: 12.5, margin: '-14px 0 26px' }}>
                {walks} museum walk{walks === 1 ? '' : 's'}
              </p>
            )}
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
                  {((item.name && hasCardMeta(item.meta)) || cardDetailsLine(item.meta)) && (
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
                  )}
                </figure>
              ))}
            </div>
          </>
        )}
      </Section>

      <div style={{ marginTop: 10 }}>
        <ShareButton />
      </div>
    </PageShell>
  );
}
