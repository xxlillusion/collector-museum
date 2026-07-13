import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { useAuth } from '../../lib/auth';
import { isWanted, toggleWant } from '../../lib/interestService';
import { fetchWalks } from '../../lib/visitService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicVendorProfile } from '../../lib/publicVendors';
import type { PublicVendorProfile } from '../../lib/publicVendors';
import { formatLocation } from '../../lib/locations';
import { formatPrice } from '../../lib/price';
import { Section, useTheme, withAlpha } from '../../components/themeKit';

// Public vendor profile page (/vendor/:id) — owned by the vendor-portal
// workstream (Stream B). Anon-safe: reads via lib/publicVendors.ts (direct
// Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  const t = useTheme();
  return <p style={{ ...t.note, fontSize: 16 }}>{children}</p>;
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
  const { session } = useAuth();
  const t = useTheme();
  const contactLinkStyle: React.CSSProperties = {
    fontFamily: t.fontMono,
    fontSize: 12.5,
    letterSpacing: '0.14em',
    color: t.accent,
    textDecoration: 'none',
  };
  // Want-list hearts (local-first; cloud row when signed in). Version bump
  // just re-renders — isWanted() reads localStorage directly.
  const [, setWantVersion] = useState(0);

  const handleToggleWant = (itemId: string) => {
    toggleWant(session?.user.id ?? null, itemId);
    setWantVersion((v) => v + 1);
  };

  // Anonymous walk counter (0007) — null on any failure hides the line.
  const [walks, setWalks] = useState<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicVendorProfile(vendorId).then((profile) => {
      if (cancelled) return;
      setState(profile ? { status: 'ready', profile } : { status: 'notFound' });
    });
    setWalks(null);
    fetchWalks('vendor', vendorId).then((n) => {
      if (!cancelled) setWalks(n);
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
  // Signed-in owner viewing their own store — point them at MY STORES
  // (anonymous visitors and other accounts see the page unchanged).
  const isOwner = Boolean(profile.profileId && session?.user.id === profile.profileId);
  const location = formatLocation({ country: profile.country, state: profile.state });
  const areaServed = profile.areaServed.trim();
  const website = profile.website.trim();
  const contactEmail = profile.contactEmail.trim();
  const instagram = profile.instagram.trim().replace(/^@/, '');
  const hasContact = Boolean(website || contactEmail || instagram);

  return (
    <PageShell title={profile.name} eyebrow="REGISTERED VENDOR">
      {isOwner && (
        <div
          style={{
            border: `${t.borderWidth}px solid ${t.border}`,
            borderRadius: 2,
            background: t.panel,
            padding: '9px 16px',
            margin: '-10px 0 26px',
            textAlign: 'center',
            fontFamily: t.fontMono,
            fontSize: 13,
            color: t.muted,
          }}
        >
          This is your store —{' '}
          <Link
            href="/account?tab=stores"
            style={{
              color: t.accent,
              textDecoration: 'none',
              letterSpacing: '0.12em',
            }}
          >
            manage it in MY STORES →
          </Link>
        </div>
      )}
      {(location || areaServed || hasContact) && (
        <div style={{ margin: '-18px 0 30px', textAlign: 'center' }}>
          {location && (
            <div
              style={{
                fontFamily: t.fontMono,
                fontSize: 14.5,
                color: t.muted,
                letterSpacing: '0.08em',
              }}
            >
              {location}
            </div>
          )}
          {areaServed && (
            <div style={{ ...t.note, fontSize: 13.5, marginTop: 5 }}>
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
            border: `${t.borderWidth}px solid ${t.border}`,
            borderRadius: 2,
            padding: 8,
            background: t.panel,
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
              {profile.items.map((item) => (
                <figure key={item.id} className="museum-lift" style={{ margin: 0, position: 'relative' }}>
                  <button
                    onClick={() => handleToggleWant(item.id)}
                    title={isWanted(item.id) ? 'On your want list' : "I'm interested"}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 1,
                      background: 'rgba(0,0,0,0.65)',
                      color: isWanted(item.id) ? t.accent : 'rgba(255,255,255,0.75)',
                      border: `${t.borderWidth}px solid ${isWanted(item.id) ? t.accent : 'rgba(255,255,255,0.3)'}`,
                      borderRadius: '50%',
                      width: 30,
                      height: 30,
                      fontSize: 14,
                      lineHeight: '28px',
                      textAlign: 'center',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {isWanted(item.id) ? '♥' : '♡'}
                  </button>
                  <img
                    src={item.imageUrl}
                    alt={item.caption || 'Inventory item'}
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
                  {(item.caption || item.price !== undefined || item.status !== 'forSale') && (
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
                      {item.caption && (
                        <span style={{ fontStyle: t.id === 'refined' ? 'italic' : 'normal' }}>
                          {item.caption}
                        </span>
                      )}
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
                                color: item.status === 'sold' ? t.muted : t.accent,
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
                            <>
                              {(item.price !== undefined || item.condition) && (
                                <span style={{ color: t.id === 'refined' ? '#b0685c' : t.muted, letterSpacing: '0.2em' }}> · </span>
                              )}
                              <span
                                style={t.id === 'refined'
                                  ? { color: '#b0685c', letterSpacing: '0.2em' }
                                  : t.chip}
                              >
                                SOLD
                              </span>
                            </>
                          )}
                          {item.status === 'display' && (
                            <>
                              {(item.price !== undefined || item.condition) && (
                                <span style={{ fontStyle: t.id === 'refined' ? 'italic' : 'normal' }}> · </span>
                              )}
                              <span
                                style={t.id === 'refined'
                                  ? { fontStyle: 'italic' }
                                  : { ...t.chip, background: 'transparent', color: t.muted, border: `1px solid ${t.border}` }}
                              >
                                Display only
                              </span>
                            </>
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
                  borderBottom: `1px solid ${withAlpha(t.accent, 0.12)}`,
                  textDecoration: 'none',
                  color: t.text,
                }}
              >
                <span
                  style={{
                    fontFamily: t.fontDisplay,
                    fontSize: 16,
                    color: t.text,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {show.name}
                </span>
                <span style={{ ...t.note, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {formatShowDate(show.date)}
                </span>
                <span
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: 12,
                    letterSpacing: '0.16em',
                    color: t.accent,
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
