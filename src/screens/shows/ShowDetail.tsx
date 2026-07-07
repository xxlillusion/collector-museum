import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getShowForWalk } from '../../lib/publicShows';
import type { ShowWalkData } from '../../lib/publicShows';
import { formatShowDate } from './ShowDirectory';

const GOLD = '#d4af37';

// Lazy so /show/:id stays a light DOM page — the three.js hall chunk loads
// only when Walk is pressed.
const VendorScene = lazy(() => import('../../components/VendorScene'));

// Public shows carry no legacy per-box banners and no global tablecloth
// banner — vendors' own banners arrive via the vendors prop.
const EMPTY_BANNERS = new Map<string, string>();

// Owned by the shows workstream (Stream C).
export default function ShowDetail({ showId }: { showId: string }) {
  // undefined = loading, null = not found / unavailable
  const [show, setShow] = useState<ShowWalkData | null | undefined>(undefined);
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setShow(null);
      return;
    }
    let alive = true;
    getShowForWalk(showId).then((s) => {
      if (alive) setShow(s);
    });
    return () => {
      alive = false;
    };
  }, [showId]);

  const canWalk = Boolean(show?.meta && show?.planUrl);

  if (walking && show && show.meta && show.planUrl) {
    return (
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
        <VendorScene
          planMeta={show.meta}
          planUrl={show.planUrl}
          bannerUrl={null}
          vendorBannerUrls={EMPTY_BANNERS}
          vendors={show.vendors}
          fetchInventory={show.fetchInventory}
          onBack={() => setWalking(false)}
        />
      </Suspense>
    );
  }

  return (
    <PageShell title={show?.name ?? 'Show'}>
      {show === undefined && <p style={noteStyle}>Loading show…</p>}

      {show === null && (
        <>
          <p style={noteStyle}>
            {isSupabaseConfigured
              ? "This show isn't published (or doesn't exist)."
              : 'The shows directory needs a configured backend — this deployment runs in guest-only mode.'}
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/shows" style={{ color: GOLD, fontSize: 15 }}>
              ← All card shows
            </Link>
          </p>
        </>
      )}

      {show && (
        <>
          <p style={{ fontSize: 16, color: '#b7ad98', margin: '0 0 22px' }}>
            {formatShowDate(show.showDate) ?? 'Date to be announced'}
          </p>

          <button
            onClick={() => setWalking(true)}
            disabled={!canWalk}
            style={{
              background: canWalk ? GOLD : '#33302a',
              color: canWalk ? '#1a1614' : '#6c6455',
              border: 'none',
              borderRadius: 8,
              padding: '15px 42px',
              fontSize: 17,
              letterSpacing: 2,
              cursor: canWalk ? 'pointer' : 'not-allowed',
              fontFamily: 'Georgia, serif',
              marginBottom: canWalk ? 30 : 10,
            }}
          >
            WALK THIS SHOW →
          </button>
          {!canWalk && (
            <p style={{ ...noteStyle, fontSize: 14, margin: '0 0 26px' }}>
              This show has no walkable floor plan yet — the organizer hasn't uploaded one.
            </p>
          )}

          {show.planUrl && (
            <div
              style={{
                border: '1px solid #4a4436',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#0d0b09',
                marginBottom: 30,
              }}
            >
              <img
                src={show.planUrl}
                alt={`${show.name} floor plan`}
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          )}

          <h2
            style={{
              fontWeight: 400,
              fontSize: 20,
              letterSpacing: 2,
              color: '#f0e6ce',
              margin: '0 0 14px',
            }}
          >
            ATTENDING VENDORS
          </h2>
          {show.vendors.length === 0 ? (
            <p style={{ ...noteStyle, fontSize: 15 }}>No vendors assigned to booths yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {show.vendors.map((v) => (
                <Link
                  key={v.id}
                  href={`/vendor/${v.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    border: '1px solid #3a352c',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.025)',
                    color: '#e8e0d0',
                    textDecoration: 'none',
                    fontSize: 15,
                  }}
                >
                  {v.name}
                  <span style={{ color: '#8a816d', fontSize: 12 }}>
                    {v.inventoryCount > 0
                      ? `${v.inventoryCount} item${v.inventoryCount === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p style={{ marginTop: 34 }}>
            <Link href="/shows" style={{ color: GOLD, fontSize: 15 }}>
              ← All card shows
            </Link>
          </p>
        </>
      )}
    </PageShell>
  );
}

const noteStyle: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.7,
  color: '#b7ad98',
  fontStyle: 'italic',
};
