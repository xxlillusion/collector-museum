import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getShowForWalk } from '../../lib/publicShows';
import type { ShowWalkData } from '../../lib/publicShows';
import { getStarredVendors, toggleStarredVendor } from '../../lib/starredVendors';
import { useAuth } from '../../lib/auth';
import { listMyStores } from '../../lib/profileService';
import type { MyStoreRecord } from '../../lib/profileService';
import {
  applyForBooth, listMyApplications, withdrawApplication,
} from '../../lib/applicationService';
import type { BoothApplication } from '../../lib/applicationService';
import { formatShowDate } from './ShowDirectory';
import { formatLocation } from '../../lib/locations';
import {
  GOLD, HAIRLINE, TEXT, MUTED, PANEL, SERIF,
  Section, primaryButtonStyle, primaryButtonDisabledStyle, ghostButtonStyle,
  inputStyle, noteStyle, errorTextStyle,
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
  // Route planning: starred vendors glow on the minimap during the walk.
  // localStorage-backed per show — works for anonymous visitors.
  const [starred, setStarred] = useState<Set<string>>(() => getStarredVendors(showId));

  const handleToggleStar = (vendorId: string) => {
    setStarred(toggleStarredVendor(showId, vendorId));
  };

  // ---- booth application (signed-in vendor accounts) ----
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [myStores, setMyStores] = useState<MyStoreRecord[]>([]);
  const [myApps, setMyApps] = useState<BoothApplication[]>([]);
  const [applyStoreId, setApplyStoreId] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setMyStores([]);
      setMyApps([]);
      return;
    }
    let alive = true;
    listMyStores(userId)
      .then((stores) => {
        if (!alive) return;
        setMyStores(stores);
        setApplyStoreId((cur) => cur || stores[0]?.id || '');
      })
      .catch(() => { if (alive) setMyStores([]); });
    listMyApplications(showId, userId).then((apps) => {
      if (alive) setMyApps(apps);
    });
    return () => { alive = false; };
  }, [userId, showId]);

  // Keep the picker on a store that hasn't applied yet
  useEffect(() => {
    const unapplied = myStores.filter((s) => !myApps.some((a) => a.vendorId === s.id));
    if (!unapplied.some((s) => s.id === applyStoreId)) {
      setApplyStoreId(unapplied[0]?.id ?? '');
    }
  }, [myStores, myApps, applyStoreId]);

  const handleApply = async () => {
    if (!userId || !applyStoreId || applyBusy) return;
    setApplyBusy(true);
    setApplyError(null);
    try {
      await applyForBooth({
        applicantId: userId,
        showId,
        vendorId: applyStoreId,
        message: applyMessage,
      });
      setApplyMessage('');
      setMyApps(await listMyApplications(showId, userId));
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyBusy(false);
    }
  };

  const handleWithdraw = async (id: string) => {
    if (!userId) return;
    setApplyError(null);
    try {
      await withdrawApplication(id);
      setMyApps(await listMyApplications(showId, userId));
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setShow(null);
      return;
    }
    let alive = true;
    setStarred(getStarredVendors(showId)); // re-sync if the route swaps shows
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
          starredVendorIds={starred}
          onToggleStar={handleToggleStar}
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
                {canWalk && (
                  <p style={{ ...noteStyle, fontSize: 12.5, margin: '0 0 10px' }}>
                    ★ Star the vendors you want to visit — their booths glow on the map
                    when you walk the show.
                  </p>
                )}
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
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleStar(v.id);
                      }}
                      title={starred.has(v.id) ? 'Unstar this vendor' : 'Star — glow on the walk map'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 17,
                        lineHeight: 1,
                        padding: '0 2px',
                        color: starred.has(v.id) ? GOLD : 'rgba(212,175,55,0.35)',
                      }}
                    >
                      {starred.has(v.id) ? '★' : '☆'}
                    </button>
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

          {myStores.length > 0 && (
            <Section title="EXHIBIT AT THIS SHOW">
              {myApps.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {myApps.map((app) => (
                    <div
                      key={app.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 14,
                        flexWrap: 'wrap',
                        padding: '10px 8px',
                        borderBottom: '1px solid rgba(212,175,55,0.12)',
                      }}
                    >
                      <span style={{ fontFamily: SERIF, fontSize: 15, color: TEXT, flex: 1, minWidth: 120 }}>
                        {app.vendorName}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.18em',
                          fontFamily: SERIF,
                          color: app.status === 'approved' ? GOLD : app.status === 'declined' ? '#b0685c' : MUTED,
                          border: `1px solid ${app.status === 'approved' ? GOLD : HAIRLINE}`,
                          borderRadius: 2,
                          padding: '3px 9px',
                        }}
                      >
                        {app.status.toUpperCase()}
                      </span>
                      {app.status === 'pending' && (
                        <button
                          onClick={() => handleWithdraw(app.id)}
                          style={{ ...ghostButtonStyle, padding: '5px 12px', fontSize: 11 }}
                        >
                          WITHDRAW
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {myStores.some((s) => !myApps.some((a) => a.vendorId === s.id)) && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {myStores.filter((s) => !myApps.some((a) => a.vendorId === s.id)).length > 1 ? (
                    <select
                      value={applyStoreId}
                      onChange={(e) => setApplyStoreId(e.target.value)}
                      style={{ ...inputStyle, width: 200 }}
                    >
                      {myStores
                        .filter((s) => !myApps.some((a) => a.vendorId === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  ) : (
                    <span style={{ fontFamily: SERIF, fontSize: 14.5, color: TEXT, alignSelf: 'center' }}>
                      {myStores.find((s) => !myApps.some((a) => a.vendorId === s.id))?.name}
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Message to the organizer (optional)"
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 220 }}
                  />
                  <button
                    onClick={handleApply}
                    disabled={applyBusy || !applyStoreId}
                    style={applyBusy ? primaryButtonDisabledStyle : primaryButtonStyle}
                  >
                    {applyBusy ? 'APPLYING…' : 'APPLY FOR A BOOTH →'}
                  </button>
                </div>
              )}
              {applyError && <p style={{ ...errorTextStyle, marginTop: 12 }}>{applyError}</p>}
              <p style={{ ...noteStyle, fontSize: 12, marginTop: 12 }}>
                The organizer reviews applications and assigns booths — approval appears here
                and your store shows up on the floor plan once placed.
              </p>
            </Section>
          )}

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
