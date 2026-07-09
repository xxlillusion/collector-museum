import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getShowForWalk } from '../../lib/publicShows';
import type { ShowWalkData } from '../../lib/publicShows';
import { formatShowDate } from './ShowDirectory';
import { formatLocation } from '../../lib/locations';
import {
  GOLD, HAIRLINE, TEXT, PANEL, SERIF,
  Section, primaryButtonStyle, primaryButtonDisabledStyle, noteStyle,
} from '../../components/museumKit';

// Lazy so /show/:id stays a light DOM page — the three.js hall chunk loads
// only when Walk is pressed.
const VendorScene = lazy(() => import('../../components/VendorScene'));

// Public shows carry no legacy per-box banners and no global tablecloth
// banner — vendors' own banners arrive via the vendors prop.
const EMPTY_BANNERS = new Map<string, string>();

const backLinkStyle: CSSProperties = {
  color: GOLD,
  textDecoration: 'none',
  fontFamily: SERIF,
  fontSize: 12.5,
  letterSpacing: '0.18em',
};

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
          exitLabel="← Leave Show"
        />
      </Suspense>
    );
  }

  return (
    <PageShell title={show?.name ?? 'Show'} eyebrow="PUBLIC EXHIBITION">
      {show === undefined && <p style={{ ...noteStyle, fontSize: 16 }}>Loading show…</p>}

      {show === null && (
        <>
          <p style={{ ...noteStyle, fontSize: 16 }}>
            {isSupabaseConfigured
              ? "This show isn't published (or doesn't exist)."
              : 'The shows directory needs a configured backend — this deployment runs in guest-only mode.'}
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/shows" style={backLinkStyle}>
              ← ALL CARD SHOWS
            </Link>
          </p>
        </>
      )}

      {show && (
        <>
          <div
            style={{
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 4,
              background: PANEL,
              padding: '20px 26px',
              marginBottom: 28,
              textAlign: 'center',
            }}
          >
            {canWalk && (
              <div
                style={{
                  display: 'inline-block',
                  fontFamily: SERIF,
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  color: GOLD,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 2,
                  padding: '3px 10px',
                  marginBottom: 12,
                }}
              >
                ◈ WALKABLE IN 3D
              </div>
            )}
            <div style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: '0.05em', color: TEXT }}>
              {formatShowDate(show.showDate) ?? 'Date to be announced'}
            </div>
            {(show.venueName || formatLocation(show)) && (
              <div style={{ ...noteStyle, fontSize: 14, marginTop: 7 }}>
                {[show.venueName, formatLocation(show)].filter(Boolean).join(' · ')}
              </div>
            )}
            {show.address && (
              <div style={{ marginTop: 7 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...noteStyle, fontSize: 13.5, color: GOLD, textDecoration: 'none' }}
                >
                  {show.address} ↗
                </a>
              </div>
            )}
            {(show.hours || show.admission) && (
              <div style={{ ...noteStyle, fontSize: 13.5, marginTop: 7 }}>
                {[show.hours, show.admission].filter(Boolean).join(' · ')}
              </div>
            )}
            {show.externalUrl && (
              <div style={{ marginTop: 10 }}>
                <a
                  href={show.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: SERIF,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: GOLD,
                    textDecoration: 'none',
                  }}
                >
                  SHOW WEBSITE / TICKETS →
                </a>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginBottom: canWalk ? 34 : 12 }}>
            <button
              onClick={() => setWalking(true)}
              disabled={!canWalk}
              style={{
                ...(canWalk ? primaryButtonStyle : primaryButtonDisabledStyle),
                padding: '14px 44px',
                fontSize: 14,
              }}
            >
              WALK THIS SHOW →
            </button>
          </div>
          {!canWalk && (
            <p style={{ ...noteStyle, fontSize: 14, margin: '0 0 26px', textAlign: 'center' }}>
              This show has no walkable floor plan yet — the organizer hasn't uploaded one.
            </p>
          )}

          {show.planUrl && (
            <div
              style={{
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 2,
                padding: 8,
                background: PANEL,
                marginBottom: 38,
              }}
            >
              <img
                src={show.planUrl}
                alt={`${show.name} floor plan`}
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          )}

          <Section title="ATTENDING VENDORS">
            {show.vendors.length === 0 ? (
              <p style={{ ...noteStyle, fontSize: 14.5 }}>No vendors assigned to booths yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {show.vendors.map((v) => (
                  <Link
                    key={v.id}
                    href={`/vendor/${v.id}`}
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
                      {v.name}
                    </span>
                    <span style={{ ...noteStyle, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {v.inventoryCount > 0
                        ? `${v.inventoryCount} item${v.inventoryCount === 1 ? '' : 's'}`
                        : ''}
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
                      VISIT →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <Link href="/shows" style={backLinkStyle}>
              ← ALL CARD SHOWS
            </Link>
            <ShareButton title={show.name} />
          </div>
        </>
      )}
    </PageShell>
  );
}
