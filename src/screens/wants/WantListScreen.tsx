import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getWantedItemIds, toggleWant } from '../../lib/interestService';
import { fetchWantedItems } from '../../lib/publicWants';
import type { WantedItem } from '../../lib/publicWants';
import { formatPrice } from '../../lib/price';
import { useTheme } from '../../components/themeKit';
import { LcdDialog, lcdWell } from '../../components/lcdKit';

// /wants — the visitor's want-list. Hearts live in localStorage
// (lib/interestService.ts), so this page works fully signed-out and in the
// sandbox; the cloud rows are only the vendor-side demand mirror. Items are
// resolved anon-safely via lib/publicWants.ts and grouped by vendor.
// Handheld: tiles sit on a recessed LCD well (thumbnails go pixelated via
// t.cardFrame), unheart is an inverted chip, and the empty / not-listed
// states become dialog boxes.

function Note({ children }: { children: string }) {
  const t = useTheme();
  return <p style={{ ...t.note, fontSize: t.id === 'handheld' ? 11 : 16 }}>{children}</p>;
}

export default function WantListScreen() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const [, navigate] = useLocation();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WantedItem[]>([]);
  // Hearted ids that didn't resolve to a live public item (deleted, hidden,
  // or hearted against local-sandbox data) — counted once at fetch time.
  const [missing, setMissing] = useState(0);

  useEffect(() => {
    let alive = true;
    const ids = getWantedItemIds();
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    fetchWantedItems(ids).then((resolved) => {
      if (!alive) return;
      setItems(resolved);
      setMissing(ids.length - resolved.length);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleUnheart = (id: string) => {
    // Side-effect toggle stays OUTSIDE the state updater (StrictMode
    // double-invokes updaters and would un-toggle the toggle).
    toggleWant(session?.user.id ?? null, id);
    setItems((cur) => cur.filter((item) => item.id !== id));
  };

  const groups = useMemo(() => {
    const byVendor = new Map<string, { name: string; items: WantedItem[] }>();
    for (const item of items) {
      const group = byVendor.get(item.vendorId);
      if (group) group.items.push(item);
      else byVendor.set(item.vendorId, { name: item.vendorName, items: [item] });
    }
    return [...byVendor.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [items]);

  return (
    <PageShell title="Want List" eyebrow="MY MARKS">
      {loading && <Note>Checking your marks…</Note>}

      {!loading && items.length === 0 && missing === 0 && (lcd ? (
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <LcdDialog
            cursor
            choices={[
              { label: 'BROWSE CARD SHOWS', onClick: () => navigate('/shows'), primary: true },
            ]}
          >
            YOUR WANT LIST IS EMPTY! HEART CARDS AS YOU BROWSE!
          </LcdDialog>
        </div>
      ) : (
        <Note>Nothing marked yet — tap ♡ on any card at a show or vendor page.</Note>
      ))}

      {!loading &&
        groups.map(([vendorId, group]) => (
          <section key={vendorId} style={{ marginBottom: 40 }}>
            <Link
              href={`/vendor/${vendorId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 12,
                textDecoration: 'none',
                fontFamily: t.fontDisplay,
                fontSize: lcd ? 12 : 17,
                fontWeight: lcd ? 700 : undefined,
                letterSpacing: lcd ? '0.06em' : '0.1em',
                color: t.text,
                textTransform: lcd ? 'uppercase' : undefined,
              }}
            >
              {group.name}
              <span
                style={{
                  fontSize: lcd ? 9.5 : 11,
                  letterSpacing: lcd ? '0.06em' : '0.18em',
                  color: t.accent,
                  whiteSpace: 'nowrap',
                  fontFamily: t.fontMono,
                }}
              >
                VISIT →
              </span>
            </Link>
            <div
              style={{
                height: lcd ? 2 : 1,
                background: lcd ? t.border : `linear-gradient(90deg, ${t.border}, transparent)`,
                margin: '10px 0 18px',
              }}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: lcd
                  ? 'repeat(auto-fill, minmax(120px, 1fr))'
                  : 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: lcd ? 14 : 18,
                alignItems: 'start',
                // The LCD binder-well: tiles sit on the recessed mid surface.
                ...(lcd ? lcdWell : {}),
              }}
            >
              {group.items.map((item) => (
                <figure
                  key={item.id}
                  className="museum-lift"
                  style={{ margin: 0, position: 'relative' }}
                >
                  <button
                    onClick={() => handleUnheart(item.id)}
                    title="Remove from want list"
                    style={lcd ? {
                      // Inverted square chip — no dark scrim on the LCD.
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      zIndex: 1,
                      background: t.accent,
                      color: t.accentContrast,
                      border: 'none',
                      borderRadius: 0,
                      width: 26,
                      height: 26,
                      fontSize: 12,
                      lineHeight: '26px',
                      textAlign: 'center',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: t.fontMono,
                    } : {
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 1,
                      background: 'rgba(0,0,0,0.65)',
                      color: t.accent,
                      border: `${t.borderWidth}px solid ${t.accent}`,
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
                    ♥
                  </button>
                  <img
                    src={item.imageUrl}
                    alt={item.caption || 'Marked item'}
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
                  {(item.caption || item.price !== undefined || item.condition || item.status !== 'forSale') && (
                    <figcaption
                      style={{
                        marginTop: 10,
                        fontFamily: t.fontMono,
                        fontSize: lcd ? 10 : 12.5,
                        lineHeight: lcd ? 1.7 : 1.5,
                        color: t.muted,
                        textAlign: 'center',
                        textTransform: lcd ? 'uppercase' : undefined,
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
                                fontWeight: lcd && item.status !== 'sold' ? 700 : undefined,
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
                                  : lcd
                                    ? {
                                        background: t.accent,
                                        color: t.accentContrast,
                                        fontWeight: 700,
                                        fontSize: 9,
                                        letterSpacing: '0.06em',
                                        padding: '1px 5px',
                                      }
                                    : t.chip}
                              >
                                {lcd ? 'SOLD!' : 'SOLD'}
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
                                  : {
                                      ...t.chip,
                                      background: 'transparent',
                                      color: t.muted,
                                      border: lcd ? `2px solid ${t.muted}` : `1px solid ${t.border}`,
                                    }}
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
          </section>
        ))}

      {!loading && missing > 0 && (lcd ? (
        <div style={{ maxWidth: 520, margin: items.length > 0 ? '10px auto 0' : '0 auto' }}>
          <LcdDialog>
            {missing === 1
              ? "1 MARKED ITEM ISN'T LISTED ANYMORE! (OR WAS HEARTED IN THE LOCAL SANDBOX)"
              : `${missing} MARKED ITEMS AREN'T LISTED ANYMORE! (OR WERE HEARTED IN THE LOCAL SANDBOX)`}
          </LcdDialog>
        </div>
      ) : (
        <p style={{ ...t.note, fontSize: 13.5, marginTop: items.length > 0 ? 6 : 0 }}>
          {missing === 1
            ? "1 marked item isn't listed anymore (or was hearted in the local sandbox)."
            : `${missing} marked items aren't listed anymore (or were hearted in the local sandbox).`}
        </p>
      ))}
    </PageShell>
  );
}
