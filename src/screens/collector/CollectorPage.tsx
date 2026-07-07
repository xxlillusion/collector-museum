import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicCollectorProfile } from '../../lib/publicCollectors';
import type { PublicCollectorProfile } from '../../lib/publicCollectors';
import { formatLocation } from '../../lib/locations';

// Public collector profile page (/collector/:id) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicCollectors.ts
// (direct Supabase queries, CDN image URLs), no auth or provider required.

const GOLD = '#d4af37';
const MUTED = '#9a8f7d';
const HAIRLINE = 'rgba(212,175,55,0.28)';
const SERIF = "Georgia, 'Times New Roman', serif";

function Note({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b7ad98', fontStyle: 'italic' }}>
      {children}
    </p>
  );
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
      <PageShell title="Collector">
        <Note>
          This gallery is running in guest mode — public collector profiles need the cloud
          connection, which isn't configured here.
        </Note>
      </PageShell>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageShell title="Collector">
        <Note>Polishing the display case…</Note>
      </PageShell>
    );
  }

  if (state.status === 'notFound') {
    return (
      <PageShell title="Collector">
        <Note>Collector not found.</Note>
        <p style={{ marginTop: 24 }}>
          <Link
            href="/"
            style={{ color: GOLD, textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
          >
            Return to the museum →
          </Link>
        </p>
      </PageShell>
    );
  }

  const { profile } = state;
  const location = formatLocation(profile);
  const bio = profile.bio.trim();

  return (
    <PageShell title={profile.displayName || 'Collector'}>
      {location && (
        <div style={{ margin: '-14px 0 24px', fontSize: 15, color: MUTED, letterSpacing: '0.04em' }}>
          {location}
        </div>
      )}

      {bio && (
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.8,
            color: '#cfc6b2',
            margin: '0 0 30px',
            maxWidth: 640,
          }}
        >
          {bio}
        </p>
      )}

      <div
        style={{
          fontFamily: SERIF,
          fontSize: 13,
          letterSpacing: '0.16em',
          color: GOLD,
          margin: '38px 0 16px',
        }}
      >
        THE COLLECTION
      </div>

      {!profile.collectionPublic ? (
        <Note>This collection is private.</Note>
      ) : profile.items.length === 0 ? (
        <Note>Nothing on display yet — check back soon.</Note>
      ) : (
        <>
          <Link
            href={`/museum/collector/${profile.id}`}
            style={{
              display: 'inline-block',
              background: GOLD,
              color: '#1a1614',
              borderRadius: 2,
              padding: '12px 32px',
              fontSize: 13,
              letterSpacing: '0.16em',
              textDecoration: 'none',
              fontFamily: SERIF,
              marginBottom: 22,
            }}
          >
            VIEW IN 3D MUSEUM →
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
              <figure key={item.id} style={{ margin: 0 }}>
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
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#b7ad98',
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
    </PageShell>
  );
}
