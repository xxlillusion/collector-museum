import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicCollectorProfile } from '../../lib/publicCollectors';
import type { PublicCollectorProfile } from '../../lib/publicCollectors';
import { formatLocation } from '../../lib/locations';
import {
  GOLD, HAIRLINE, TEXT, MUTED, SERIF,
  Section, primaryButtonStyle, noteStyle,
} from '../../components/museumKit';

// Public collector profile page (/collector/:id) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicCollectors.ts
// (direct Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  return <p style={{ ...noteStyle, fontSize: 16 }}>{children}</p>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ready'; profile: PublicCollectorProfile };

export default function CollectorPage({ profileId }: { profileId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicCollectorProfile(profileId).then((profile) => {
      if (cancelled) return;
      setState(profile ? { status: 'ready', profile } : { status: 'notFound' });
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
              color: GOLD,
              textDecoration: 'none',
              fontFamily: SERIF,
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

  return (
    <PageShell title={profile.displayName || 'Collector'} eyebrow="PRIVATE GALLERY">
      {location && (
        <div
          style={{
            margin: '-18px 0 26px',
            textAlign: 'center',
            fontFamily: SERIF,
            fontSize: 14.5,
            color: MUTED,
            letterSpacing: '0.08em',
          }}
        >
          {location}
        </div>
      )}

      {bio && (
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 15.5,
            lineHeight: 1.8,
            color: TEXT,
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
                ...primaryButtonStyle,
                display: 'inline-block',
                textDecoration: 'none',
                marginBottom: 26,
              }}
            >
              WALK THE MUSEUM →
            </Link>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: 22,
                alignItems: 'start',
              }}
            >
              {profile.items.map((item) => (
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
                      borderRadius: 2,
                      border: '3px solid #3a2f1e',
                      outline: `1px solid ${HAIRLINE}`,
                      outlineOffset: 3,
                      boxSizing: 'border-box',
                      background: '#0d0b0a',
                    }}
                  />
                  {item.name && (
                    <figcaption
                      style={{
                        marginTop: 10,
                        fontFamily: SERIF,
                        fontStyle: 'italic',
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: MUTED,
                        textAlign: 'center',
                      }}
                    >
                      {item.name}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </>
        )}
      </Section>
    </PageShell>
  );
}
