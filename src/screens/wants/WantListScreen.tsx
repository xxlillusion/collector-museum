import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getWantedItemIds, toggleWant } from '../../lib/interestService';
import { fetchWantedItems } from '../../lib/publicWants';
import type { WantedItem } from '../../lib/publicWants';
import { formatPrice } from '../../lib/price';
import {
  GOLD, HAIRLINE, TEXT, MUTED, SERIF, noteStyle,
} from '../../components/museumKit';

// /wants — the visitor's want-list. Hearts live in localStorage
// (lib/interestService.ts), so this page works fully signed-out and in the
// sandbox; the cloud rows are only the vendor-side demand mirror. Items are
// resolved anon-safely via lib/publicWants.ts and grouped by vendor.

function Note({ children }: { children: string }) {
  return <p style={{ ...noteStyle, fontSize: 16 }}>{children}</p>;
}

export default function WantListScreen() {
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

      {!loading && items.length === 0 && missing === 0 && (
        <Note>Nothing marked yet — tap ♡ on any card at a show or vendor page.</Note>
      )}

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
                fontFamily: SERIF,
                fontSize: 17,
                letterSpacing: '0.1em',
                color: TEXT,
              }}
            >
              {group.name}
              <span style={{ fontSize: 11, letterSpacing: '0.18em', color: GOLD, whiteSpace: 'nowrap' }}>
                VISIT →
              </span>
            </Link>
            <div
              style={{
                height: 1,
                background: `linear-gradient(90deg, ${HAIRLINE}, transparent)`,
                margin: '10px 0 18px',
              }}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 18,
                alignItems: 'start',
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
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 1,
                      background: 'rgba(0,0,0,0.65)',
                      color: GOLD,
                      border: `1px solid ${GOLD}`,
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
                      borderRadius: 2,
                      border: '3px solid #3a2f1e',
                      outline: `1px solid ${HAIRLINE}`,
                      outlineOffset: 3,
                      boxSizing: 'border-box',
                      background: '#0d0b0a',
                    }}
                  />
                  {(item.caption || item.price !== undefined || item.condition || item.status !== 'forSale') && (
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
          </section>
        ))}

      {!loading && missing > 0 && (
        <p style={{ ...noteStyle, fontSize: 13.5, marginTop: items.length > 0 ? 6 : 0 }}>
          {missing === 1
            ? "1 marked item isn't listed anymore (or was hearted in the local sandbox)."
            : `${missing} marked items aren't listed anymore (or were hearted in the local sandbox).`}
        </p>
      )}
    </PageShell>
  );
}
