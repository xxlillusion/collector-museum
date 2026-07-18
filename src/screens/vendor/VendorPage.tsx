import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
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
import type { LcdChoice } from '../../components/lcdKit';
import {
  LCD,
  LcdDialog,
  lcdImg,
  lcdSoldStamp,
  lcdWell,
} from '../../components/lcdKit';

// Public vendor profile page (/vendor/:id) — owned by the vendor-portal
// workstream (Stream B). Anon-safe: reads via lib/publicVendors.ts (direct
// Supabase queries, CDN image URLs), no auth or provider required.

function Note({ children }: { children: string }) {
  const t = useTheme();
  return <p style={{ ...t.note, fontSize: t.id === 'handheld' ? 11 : 16 }}>{children}</p>;
}

/** Short show date for handheld chips — "AUG 02". */
function shortShowDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
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
  const [, navigate] = useLocation();
  // Handheld shopkeeper greeting — "JUST BROWSE" dismisses it for this visit.
  const [greetDismissed, setGreetDismissed] = useState(false);
  const lcd = t.id === 'handheld';
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

  // Handheld binder-page pagination (#6d): 9 items per "page" — a 3×3 pocket
  // sheet. Presentation-only; the other themes render the full grid.
  const LCD_PAGE_SIZE = 9;
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    setPage(0);
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
        {lcd ? (
          <LcdDialog cursor>
            ! NO LINK CABLE! PUBLIC VENDOR PAGES NEED A CLOUD CONNECTION — THIS
            MACHINE RUNS IN GUEST MODE.
          </LcdDialog>
        ) : (
          <Note>
            This gallery is running in guest mode — public vendor profiles need the cloud
            connection, which isn't configured here.
          </Note>
        )}
      </PageShell>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageShell title="Vendor Profile" eyebrow="REGISTERED VENDOR">
        <Note>{lcd ? 'OPENING THE SHOP…' : 'Unrolling the banner…'}</Note>
      </PageShell>
    );
  }

  if (state.status === 'notFound') {
    return (
      <PageShell title="Vendor Profile" eyebrow="REGISTERED VENDOR">
        {lcd ? (
          <LcdDialog
            choices={[{ label: 'GO HOME', primary: true, onClick: () => navigate('/') }]}
          >
            ! THIS SHOP IS GONE! THE PROFILE MAY HAVE BEEN REMOVED, OR THE LINK MAY
            BE WRONG.
          </LcdDialog>
        ) : (
          <>
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
          </>
        )}
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
  // Handheld: WALK IN 3D only when the museum link renders below (public,
  // non-empty inventory); JUST BROWSE dismisses the greeting.
  const walkable = profile.inventoryPublic && profile.items.length > 0;
  const greetChoices: LcdChoice[] = [
    ...(walkable
      ? [{
          label: 'WALK IN 3D',
          primary: true,
          onClick: () => navigate(`/museum/vendor/${profile.id}`),
        }]
      : []),
    { label: 'JUST BROWSE', primary: !walkable, onClick: () => setGreetDismissed(true) },
  ];
  // Square LCD pager chips for the binder-page bar.
  const pagerBtn = (off: boolean): React.CSSProperties => ({
    background: LCD.panel,
    color: LCD.ink,
    border: `2px solid ${LCD.ink}`,
    borderRadius: 0,
    width: 24,
    height: 22,
    padding: 0,
    fontFamily: t.fontMono,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    cursor: off ? 'default' : 'pointer',
    opacity: off ? 0.4 : 1,
  });

  // #6d header aside: "WEB ↗ / MAIL ✉ / @HANDLE" chips on the LCD title row
  // (replaces the default nav there — mockup shows contacts only).
  const lcdAsideLink = {
    color: t.text,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  } as const;
  const lcdAside = lcd && hasContact ? (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        fontFamily: t.fontMono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        minWidth: 0,
      }}
    >
      {website && (
        <a
          href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
          target="_blank"
          rel="noreferrer"
          style={lcdAsideLink}
        >
          WEB ↗
        </a>
      )}
      {contactEmail && (
        <a href={`mailto:${contactEmail}`} style={lcdAsideLink}>
          MAIL ✉
        </a>
      )}
      {instagram && (
        <a
          href={`https://instagram.com/${instagram}`}
          target="_blank"
          rel="noreferrer"
          style={lcdAsideLink}
        >
          @{instagram.toUpperCase()}
        </a>
      )}
    </span>
  ) : undefined;

  // Handheld pagination state derived per render (state above the early
  // returns): the grid shows one 3×3 "binder page" at a time.
  const lcdPageCount = Math.max(1, Math.ceil(profile.items.length / LCD_PAGE_SIZE));
  const lcdPage = Math.min(page, lcdPageCount - 1);
  const gridItems = lcd
    ? profile.items.slice(lcdPage * LCD_PAGE_SIZE, (lcdPage + 1) * LCD_PAGE_SIZE)
    : profile.items;

  const inventoryGrid = (
    <div
      style={{
        display: 'grid',
        // Handheld (#6d): bigger framed tile panels, ~3-up in the frame.
        gridTemplateColumns: lcd
          ? 'repeat(auto-fill, minmax(180px, 1fr))'
          : 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: lcd ? 14 : 22,
        alignItems: 'start',
      }}
    >
      {gridItems.map((item) => {
        const sold = item.status === 'sold';
        const wanted = isWanted(item.id);
        // Handheld meta line: SOLD is told by the stamp + struck price, so the
        // text line only needs price / condition / the DISPLAY chip.
        const lcdMeta = item.price !== undefined || Boolean(item.condition) || item.status === 'display';
        const img = (
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
              // Handheld: the TILE carries the frame (mockup panels) — the
              // image itself just gets the LCD pixelation; sold dims under
              // the stamp.
              ...(lcd
                ? { ...lcdImg, ...(sold ? { filter: 'saturate(0.5)' } : {}) }
                : t.cardFrame),
            }}
          />
        );
        return (
          <figure key={item.id} className="museum-lift" style={{ margin: 0, position: 'relative' }}>
            <button
              onClick={() => handleToggleWant(item.id)}
              title={wanted ? 'On your want list' : "I'm interested"}
              style={lcd ? {
                // Handheld want chip: ♥ active = inverted (ink bg, screen text).
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 1,
                background: wanted ? LCD.ink : LCD.panel,
                color: wanted ? LCD.screen : LCD.ink,
                border: `2px solid ${LCD.ink}`,
                borderRadius: 0,
                width: 28,
                height: 28,
                fontFamily: t.fontMono,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: '24px',
                textAlign: 'center',
                padding: 0,
                cursor: 'pointer',
              } : {
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 1,
                background: 'rgba(0,0,0,0.65)',
                color: wanted ? t.accent : 'rgba(255,255,255,0.75)',
                border: `${t.borderWidth}px solid ${wanted ? t.accent : 'rgba(255,255,255,0.3)'}`,
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
              {wanted ? '♥' : '♡'}
            </button>
            {lcd ? (
              // #6d tile panel: 3px ink frame on screen bg; name + "$240 · NM"
              // meta live INSIDE the panel, left-aligned.
              <div style={{ border: `3px solid ${LCD.ink}`, background: LCD.screen, padding: 8 }}>
                <div style={{ position: 'relative' }}>
                  {img}
                  {sold && <span style={lcdSoldStamp}>SOLD!</span>}
                </div>
                {(item.caption || lcdMeta) && (
                  <figcaption
                    style={{
                      marginTop: 8,
                      fontFamily: t.fontMono,
                      lineHeight: 1.6,
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {item.caption && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: LCD.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.caption}
                      </span>
                    )}
                    {lcdMeta && (
                      <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, color: LCD.muted }}>
                        {item.price !== undefined && (
                          <span
                            style={{
                              color: LCD.ink,
                              fontWeight: 700,
                              textDecoration: sold ? 'line-through' : 'none',
                            }}
                          >
                            {formatPrice(item.price)}
                          </span>
                        )}
                        {item.condition && (
                          <span>{item.price !== undefined ? ' · ' : ''}{item.condition}</span>
                        )}
                        {item.status === 'display' && (
                          <span
                            style={{
                              ...t.chip,
                              marginLeft: item.price !== undefined || item.condition ? 6 : 0,
                            }}
                          >
                            DISPLAY
                          </span>
                        )}
                      </span>
                    )}
                  </figcaption>
                )}
              </div>
            ) : (
              <>
                {img}
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
              </>
            )}
          </figure>
        );
      })}
    </div>
  );

  return (
    <PageShell title={profile.name} eyebrow="REGISTERED VENDOR" aside={lcdAside}>
      {lcd && !greetDismissed && (
        <LcdDialog cursor style={{ marginBottom: 26 }} choices={greetChoices}>
          HI! WELCOME TO {profile.name}!
          {walkable ? ' TAKE A LOOK AT THE BINDER — OR WALK THE TABLE IN 3D!' : ''}
        </LcdDialog>
      )}
      {isOwner &&
        (lcd ? (
          <LcdDialog
            style={{ marginBottom: 26 }}
            choices={[
              {
                label: 'MY STORES',
                primary: true,
                onClick: () => navigate('/account?tab=stores'),
              },
            ]}
          >
            THIS IS YOUR STORE! YOU CAN MANAGE IT IN MY STORES.
          </LcdDialog>
        ) : (
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
        ))}
      {(location || areaServed || hasContact || (lcd && walks !== null && walks >= 1)) && (
        <div
          style={lcd
            // #6d: compact left-aligned meta line under the header ("· SEATTLE"
            // + walk-count chip); contacts live in the header aside.
            ? { margin: '0 0 20px', textAlign: 'left' }
            : { margin: '-18px 0 30px', textAlign: 'center' }}
        >
          {location && (
            <div
              style={{
                fontFamily: t.fontMono,
                fontSize: lcd ? 10 : 14.5,
                color: t.muted,
                letterSpacing: '0.08em',
                textTransform: lcd ? 'uppercase' : undefined,
                display: lcd ? 'inline' : undefined,
              }}
            >
              {lcd ? `· ${location}` : location}
            </div>
          )}
          {areaServed && (
            <div style={{ ...t.note, fontSize: lcd ? 9.5 : 13.5, marginTop: 5, display: lcd ? 'inline' : undefined, marginLeft: lcd && location ? 8 : 0 }}>
              Serves: {areaServed}
            </div>
          )}
          {lcd && walks !== null && walks >= 1 && (
            <span style={{ ...t.chip, marginLeft: location || areaServed ? 10 : 0 }}>
              {walks} MUSEUM WALK{walks === 1 ? '' : 'S'}
            </span>
          )}
          {hasContact && !lcd && (
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
            borderRadius: lcd ? 0 : 2,
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
              ...(lcd ? lcdImg : {}),
            }}
          />
        </div>
      )}

      {/* #6d handheld: no section chrome — the tiles well follows the
          greeting directly, closed by the binder-page bar (PAGE X/Y ◀ ▶ left,
          APPEARS AT right). WALK access returns as a chip once the greeting
          is dismissed. */}
      {lcd ? (
        !profile.inventoryPublic ? (
          <LcdDialog cursor>THIS VENDOR KEEPS THE BINDER PRIVATE!</LcdDialog>
        ) : profile.items.length === 0 ? (
          <LcdDialog cursor>NOTHING ON THE TABLE YET — CHECK BACK SOON!</LcdDialog>
        ) : (
          <>
            <div style={lcdWell}>{inventoryGrid}</div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                fontFamily: t.fontMono,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: LCD.ink,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {greetDismissed && (
                  <Link
                    href={`/museum/vendor/${profile.id}`}
                    style={{ ...t.chip, fontWeight: 700, textDecoration: 'none' }}
                  >
                    ▶ WALK IN 3D
                  </Link>
                )}
                {lcdPageCount > 1 && (
                  <>
                    <span style={{ fontWeight: 700 }}>
                      PAGE {lcdPage + 1}/{lcdPageCount}
                    </span>
                    <button
                      onClick={() => setPage(Math.max(0, lcdPage - 1))}
                      disabled={lcdPage === 0}
                      aria-label="Previous page"
                      style={pagerBtn(lcdPage === 0)}
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => setPage(Math.min(lcdPageCount - 1, lcdPage + 1))}
                      disabled={lcdPage >= lcdPageCount - 1}
                      aria-label="Next page"
                      style={pagerBtn(lcdPage >= lcdPageCount - 1)}
                    >
                      ▶
                    </button>
                  </>
                )}
              </span>
              {profile.upcomingShows.length > 0 && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>APPEARS AT:</span>
                  {profile.upcomingShows.map((show) => (
                    <Link
                      key={show.showId}
                      href={`/show/${show.showId}`}
                      style={{ color: LCD.ink, textDecoration: 'underline', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {show.name} ({shortShowDate(show.date)}) ▶
                    </Link>
                  ))}
                </span>
              )}
            </div>
          </>
        )
      ) : (
      <Section numeral="I." title="INVENTORY">
        {!profile.inventoryPublic ? (
          lcd ? (
            <LcdDialog cursor>THIS VENDOR KEEPS THE BINDER PRIVATE!</LcdDialog>
          ) : (
            <Note>This vendor keeps their inventory private.</Note>
          )
        ) : profile.items.length === 0 ? (
          lcd ? (
            <LcdDialog cursor>NOTHING ON THE TABLE YET — CHECK BACK SOON!</LcdDialog>
          ) : (
            <Note>Nothing on display yet — check back soon.</Note>
          )
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
              {lcd ? '▶ WALK THE MUSEUM' : 'WALK THE MUSEUM →'}
            </Link>
            {walks !== null && walks >= 1 &&
              (lcd ? (
                <div style={{ margin: '-14px 0 26px' }}>
                  <span style={t.chip}>
                    {walks} MUSEUM WALK{walks === 1 ? '' : 'S'}
                  </span>
                </div>
              ) : (
                <p style={{ ...t.note, fontSize: 12.5, margin: '-14px 0 26px' }}>
                  {walks} museum walk{walks === 1 ? '' : 's'}
                </p>
              ))}
            {lcd ? <div style={lcdWell}>{inventoryGrid}</div> : inventoryGrid}
          </>
        )}
      </Section>
      )}

      {!lcd && (
      <Section numeral="II." title="APPEARING AT">
        {profile.upcomingShows.length === 0 ? (
          <Note>{lcd ? 'NO SHOWS ON THE CALENDAR YET!' : 'No upcoming shows announced.'}</Note>
        ) : lcd ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 8,
              fontFamily: t.fontMono,
              fontSize: 10,
              letterSpacing: '0.06em',
              lineHeight: 1.9,
              color: LCD.ink,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ fontWeight: 700 }}>APPEARS AT:</span>
            {profile.upcomingShows.map((show) => (
              <Link
                key={show.showId}
                href={`/show/${show.showId}`}
                style={{
                  ...t.chip,
                  fontSize: 10,
                  padding: '3px 8px',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {show.name} · {shortShowDate(show.date)}
              </Link>
            ))}
          </div>
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
      )}

      <div style={{ marginTop: 10 }}>
        <ShareButton title={profile.name} />
      </div>
    </PageShell>
  );
}
