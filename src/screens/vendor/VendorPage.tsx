import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicVendorProfile } from '../../lib/publicVendors';
import type { PublicVendorProfile } from '../../lib/publicVendors';

// Public vendor profile page (/vendor/:id) — owned by the vendor-portal
// workstream (Stream B). Anon-safe: reads via lib/publicVendors.ts (direct
// Supabase queries, CDN image URLs), no auth or provider required.

const GOLD = '#d4af37';
const MUTED = '#9a8f7d';
const HAIRLINE = 'rgba(212,175,55,0.28)';
const SERIF = "Georgia, 'Times New Roman', serif";

function SectionHeading({ children }: { children: string }) {
  return (
    <div
      style={{
        fontFamily: SERIF,
        fontSize: 13,
        letterSpacing: '0.16em',
        color: GOLD,
        margin: '38px 0 16px',
      }}
    >
      {children}
    </div>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b7ad98', fontStyle: 'italic' }}>
      {children}
    </p>
  );
}

function formatShowDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ready'; profile: PublicVendorProfile };

export default function VendorPage({ vendorId }: { vendorId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicVendorProfile(vendorId).then((profile) => {
      if (cancelled) return;
      setState(profile ? { status: 'ready', profile } : { status: 'notFound' });
    });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!isSupabaseConfigured) {
    return (
      <PageShell title="Vendor Profile">
        <Note>
          This gallery is running in guest mode — public vendor profiles need the cloud
          connection, which isn't configured here.
        </Note>
      </PageShell>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageShell title="Vendor Profile">
        <Note>Unrolling the banner…</Note>
      </PageShell>
    );
  }

  if (state.status === 'notFound') {
    return (
      <PageShell title="Vendor Profile">
        <Note>
          We couldn't find that vendor — the profile may have been removed, or the link may be
          incorrect.
        </Note>
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

  return (
    <PageShell title={profile.name}>
      {profile.bannerUrl && (
        <div
          style={{
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 2,
            padding: 8,
            background: '#1e1915',
            marginBottom: 8,
          }}
        >
          <img
            src={profile.bannerUrl}
            alt={`${profile.name} banner`}
            style={{
              width: '100%',
              maxHeight: 240,
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
      )}

      <SectionHeading>INVENTORY</SectionHeading>
      {profile.items.length === 0 ? (
        <Note>Nothing on display yet — check back soon.</Note>
      ) : (
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
                alt={item.caption || 'Inventory item'}
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
              {item.caption && (
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
                  {item.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <SectionHeading>APPEARING AT</SectionHeading>
      {profile.upcomingShows.length === 0 ? (
        <Note>No upcoming shows announced.</Note>
      ) : (
        <div>
          {profile.upcomingShows.map((show) => (
            <Link
              key={show.showId}
              href={`/show/${show.showId}`}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
                padding: '13px 4px',
                borderBottom: `1px solid rgba(212,175,55,0.12)`,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  fontFamily: SERIF,
                  fontSize: 16,
                  color: '#f0e6ce',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {show.name}
              </span>
              <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>
                {formatShowDate(show.date)}
              </span>
              <span style={{ color: GOLD, fontSize: 13, whiteSpace: 'nowrap' }}>→</span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
