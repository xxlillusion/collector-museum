import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicVendorProfile } from '../../lib/publicVendors';
import type { PublicVendorProfile } from '../../lib/publicVendors';
import { formatLocation } from '../../lib/locations';
import { formatPrice } from '../../lib/price';
import {
  GOLD, HAIRLINE, TEXT, MUTED, PANEL, SERIF,
  Section, primaryButtonStyle, noteStyle,
} from '../../components/museumKit';

const contactLinkStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: 12.5,
  letterSpacing: '0.14em',
  color: GOLD,
  textDecoration: 'none',
};

// Public vendor profile page (/vendor/:id) — owned by the vendor-portal
// workstream (Stream B). Anon-safe: reads via lib/publicVendors.ts (direct
// Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  return <p style={{ ...noteStyle, fontSize: 16 }}>{children}</p>;
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
      <PageShell title="Vendor Profile" eyebrow="REGISTERED VENDOR">
        <Note>
          This gallery is running in guest mode — public vendor profiles need the cloud
          connection, which isn't configured here.
        </Note>
      </PageShell>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageShell title="Vendor Profile" eyebrow="REGISTERED VENDOR">
        <Note>Unrolling the banner…</Note>
      </PageShell>
    );
  }

  if (state.status === 'notFound') {
    return (
      <PageShell title="Vendor Profile" eyebrow="REGISTERED VENDOR">
        <Note>
          We couldn't find that vendor — the profile may have been removed, or the link may be
          incorrect.
        </Note>
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
  const location = formatLocation({ country: profile.country, state: profile.state });
  const areaServed = profile.areaServed.trim();
  const website = profile.website.trim();
  const contactEmail = profile.contactEmail.trim();
  const instagram = profile.instagram.trim().replace(/^@/, '');
  const hasContact = Boolean(website || contactEmail || instagram);

  return (
    <PageShell title={profile.name} eyebrow="REGISTERED VENDOR">
      {(location || areaServed || hasContact) && (
        <div style={{ margin: '-18px 0 30px', textAlign: 'center' }}>
          {location && (
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 14.5,
                color: MUTED,
                letterSpacing: '0.08em',
              }}
            >
              {location}
            </div>
          )}
          {areaServed && (
            <div style={{ ...noteStyle, fontSize: 13.5, marginTop: 5 }}>
              Serves: {areaServed}
            </div>
          )}
          {hasContact && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                gap: 26,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              {website && (
                <a
                  href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={contactLinkStyle}
                >
                  WEBSITE ↗
                </a>
              )}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} style={contactLinkStyle}>
                  CONTACT ✉
                </a>
              )}
              {instagram && (
                <a
                  href={`https://instagram.com/${instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  style={contactLinkStyle}
                >
                  @{instagram.toUpperCase()}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {profile.bannerUrl && (
        <div
          style={{
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 2,
            padding: 8,
            background: PANEL,
            marginBottom: 36,
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

      <Section numeral="I." title="INVENTORY">
        {!profile.inventoryPublic ? (
          <Note>This vendor keeps their inventory private.</Note>
        ) : profile.items.length === 0 ? (
          <Note>Nothing on display yet — check back soon.</Note>
        ) : (
          <>
            <Link
              href={`/museum/vendor/${profile.id}`}
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
                  {(item.caption || item.price !== undefined || item.status !== 'forSale') && (
                    <figcaption
                      style={{
                        marginTop: 10,
                        fontFamily: SERIF,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: MUTED,
                        textAlign: 'center',
                      }}
                    >
                      {item.caption && <span style={{ fontStyle: 'italic' }}>{item.caption}</span>}
                      {(item.price !== undefined || item.condition || item.status !== 'forSale') && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: item.caption ? 4 : 0,
                            letterSpacing: '0.08em',
                          }}
                        >
                          {item.price !== undefined && (
                            <span
                              style={{
                                color: item.status === 'sold' ? MUTED : GOLD,
                                textDecoration: item.status === 'sold' ? 'line-through' : 'none',
                              }}
                            >
                              {formatPrice(item.price)}
                            </span>
                          )}
                          {item.condition && (
                            <span>{item.price !== undefined ? ' · ' : ''}{item.condition}</span>
                          )}
                          {item.status === 'sold' && (
                            <span style={{ color: '#b0685c', letterSpacing: '0.2em' }}>
                              {item.price !== undefined || item.condition ? ' · ' : ''}SOLD
                            </span>
                          )}
                          {item.status === 'display' && (
                            <span style={{ fontStyle: 'italic' }}>
                              {item.price !== undefined || item.condition ? ' · ' : ''}Display only
                            </span>
                          )}
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

      <Section numeral="II." title="APPEARING AT">
        {profile.upcomingShows.length === 0 ? (
          <Note>No upcoming shows announced.</Note>
        ) : (
          <div>
            {profile.upcomingShows.map((show) => (
              <Link
                key={show.showId}
                href={`/show/${show.showId}`}
                className="museum-row"
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 16,
                  padding: '13px 10px',
                  borderBottom: '1px solid rgba(212,175,55,0.12)',
                  textDecoration: 'none',
                  color: TEXT,
                }}
              >
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 16,
                    color: TEXT,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {show.name}
                </span>
                <span style={{ ...noteStyle, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {formatShowDate(show.date)}
                </span>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 12,
                    letterSpacing: '0.16em',
                    color: GOLD,
                    whiteSpace: 'nowrap',
                  }}
                >
                  VIEW →
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div style={{ marginTop: 10 }}>
        <ShareButton title={profile.name} />
      </div>
    </PageShell>
  );
}
