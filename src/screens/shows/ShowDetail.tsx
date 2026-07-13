import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import ShareButton from '../../components/ShareButton';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getShowForWalk } from '../../lib/publicShows';
import type { ShowWalkData } from '../../lib/publicShows';
import { getStarredVendors, toggleStarredVendor } from '../../lib/starredVendors';
import { recordWalk, fetchWalks } from '../../lib/visitService';
import { useAuth } from '../../lib/auth';
import { listMyStores } from '../../lib/profileService';
import type { MyStoreRecord } from '../../lib/profileService';
import {
  applyForBooth, listMyApplications, withdrawApplication,
} from '../../lib/applicationService';
import type { BoothApplication } from '../../lib/applicationService';
import { formatShowDate } from './ShowDirectory';
import { formatLocation } from '../../lib/locations';
import { Section, useTheme, withAlpha } from '../../components/themeKit';

// Lazy so /show/:id stays a light DOM page — the three.js hall chunk loads
// only when Walk is pressed.
const VendorScene = lazy(() => import('../../components/VendorScene'));

// Public shows carry no legacy per-box banners and no global tablecloth
// banner — vendors' own banners arrive via the vendors prop.
const EMPTY_BANNERS = new Map<string, string>();

// Owned by the shows workstream (Stream C).
export default function ShowDetail({ showId }: { showId: string }) {
  const t = useTheme();
  const backLinkStyle: CSSProperties = {
    color: t.accent,
    textDecoration: 'none',
    fontFamily: t.fontMono,
    fontSize: 12.5,
    letterSpacing: '0.18em',
  };
  // undefined = loading, null = not found / unavailable
  const [show, setShow] = useState<ShowWalkData | null | undefined>(undefined);
  const [walking, setWalking] = useState(false);
  // Route planning: starred vendors glow on the minimap during the walk.
  // localStorage-backed per show — works for anonymous visitors.
  const [starred, setStarred] = useState<Set<string>>(() => getStarredVendors(showId));
  // Anonymous walk counter (0007) — null until fetched / on any failure
  // (unapplied migration, no row yet), which simply hides the line.
  const [walks, setWalks] = useState<number | null>(null);
  // Booth-marker name label on the 2D plan preview: hover on desktop, tap on
  // touch (index into boothMarkers).
  const [activeMarker, setActiveMarker] = useState<number | null>(null);

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
    setWalks(null);
    fetchWalks('show', showId).then((n) => {
      if (alive) setWalks(n);
    });
    return () => {
      alive = false;
    };
  }, [showId]);

  // Assigned booth centers as percentages of the plan image — route planning
  // on the 2D preview without entering 3D. Same source as the in-hall minimap
  // dots (rect centers are rotation-invariant); dangling vendor ids skipped.
  const boothMarkers = useMemo(() => {
    const meta = show?.meta;
    if (!meta || !show) return [];
    const nameById = new Map(show.vendors.map((v) => [v.id, v.name]));
    return meta.rects
      .filter((r) => r.vendorId && nameById.has(r.vendorId))
      .map((r) => ({
        leftPct: ((r.x + r.w / 2) / meta.imgW) * 100,
        topPct: ((r.y + r.h / 2) / meta.imgH) * 100,
        vendorId: r.vendorId!,
        name: nameById.get(r.vendorId!)!,
      }));
  }, [show]);

  const canWalk = Boolean(show?.meta && show?.planUrl);

  const handleWalk = () => {
    // Anonymous walk counter — public show walks only (the /demo route and
    // sandbox halls never pass through here). Fire-and-forget, day-deduped.
    recordWalk('show', showId);
    setWalking(true);
  };
  // The signed-in organizer of this show gets owner affordances instead of
  // the visitor apply flow (owners shouldn't apply to their own show).
  const isOwner = Boolean(userId && show && show.organizerId === userId);

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
          linkVendors
          onBack={() => setWalking(false)}
          exitLabel="← Leave Show"
        />
      </Suspense>
    );
  }

  return (
    <PageShell title={show?.name ?? 'Show'} eyebrow="PUBLIC EXHIBITION">
      {show === undefined && <p style={{ ...t.note, fontSize: 16 }}>Loading show…</p>}

      {show === null && (
        <>
          <p style={{ ...t.note, fontSize: 16 }}>
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
              border: `${t.borderWidth}px solid ${t.border}`,
              borderRadius: 4,
              background: t.panel,
              padding: '20px 26px',
              marginBottom: 28,
              textAlign: 'center',
            }}
          >
            {canWalk && (
              <div
                style={{
                  ...t.chip,
                  display: 'inline-block',
                  letterSpacing: '0.22em',
                  padding: '3px 10px',
                  marginBottom: 12,
                }}
              >
                ◈ WALKABLE IN 3D
              </div>
            )}
            {walks !== null && walks >= 1 && (
              <div
                style={{
                  display: 'inline-block',
                  fontFamily: t.fontMono,
                  fontSize: 12,
                  fontVariant: 'small-caps',
                  letterSpacing: '0.14em',
                  color: t.muted,
                  padding: '3px 6px',
                  marginBottom: 12,
                  marginLeft: canWalk ? 8 : 0,
                }}
              >
                ◈ {walks} {walks === 1 ? 'walk' : 'walks'}
              </div>
            )}
            <div style={{ fontFamily: t.fontDisplay, fontSize: 17, letterSpacing: '0.05em', color: t.text }}>
              {formatShowDate(show.showDate) ?? 'Date to be announced'}
            </div>
            {(show.venueName || formatLocation(show)) && (
              <div style={{ ...t.note, fontSize: 14, marginTop: 7 }}>
                {[show.venueName, formatLocation(show)].filter(Boolean).join(' · ')}
              </div>
            )}
            {show.address && (
              <div style={{ marginTop: 7 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...t.note, fontSize: 13.5, color: t.accent, textDecoration: 'none' }}
                >
                  {show.address} ↗
                </a>
              </div>
            )}
            {(show.hours || show.admission) && (
              <div style={{ ...t.note, fontSize: 13.5, marginTop: 7 }}>
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
                    fontFamily: t.fontMono,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: t.accent,
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
              onClick={handleWalk}
              disabled={!canWalk}
              style={{
                ...(canWalk ? t.primaryButton : t.primaryButtonDisabled),
                padding: '14px 44px',
                fontSize: 14,
              }}
            >
              WALK THIS SHOW →
            </button>
            {isOwner && (
              <div style={{ marginTop: 14 }}>
                <Link
                  href={`/organizer/show/${showId}/edit`}
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: 12.5,
                    letterSpacing: '0.18em',
                    color: t.accent,
                    textDecoration: 'none',
                  }}
                >
                  ✎ EDIT THIS SHOW →
                </Link>
              </div>
            )}
          </div>
          {!canWalk && (
            <p style={{ ...t.note, fontSize: 14, margin: '0 0 26px', textAlign: 'center' }}>
              This show has no walkable floor plan yet — the organizer hasn't uploaded one.
            </p>
          )}

          {show.planUrl && (
            <div
              style={{
                border: `${t.borderWidth}px solid ${t.border}`,
                borderRadius: 2,
                padding: 8,
                background: t.panel,
                marginBottom: 38,
              }}
            >
              {/* position:relative wrapper hugs the image exactly (no panel
                  padding inside), so percentage-positioned booth dots land on
                  the same spots at every viewport width. */}
              <div
                style={{ position: 'relative' }}
                // Tap/click anywhere else on the plan dismisses the label
                // (touch has no mouseleave); dot clicks stopPropagation.
                onClick={() => setActiveMarker(null)}
              >
                <img
                  src={show.planUrl}
                  alt={`${show.name} floor plan`}
                  style={{ width: '100%', display: 'block', filter: t.planFilter }}
                />
                {boothMarkers.map((m, i) => {
                  const isStarred = starred.has(m.vendorId);
                  const size = isStarred ? 13 : 9;
                  // '' = keep today's gold dots (refined); night/lobby recolor.
                  const dot = t.boothDot;
                  return (
                    <div
                      key={i}
                      data-booth-marker={m.vendorId}
                      onMouseEnter={() => setActiveMarker(i)}
                      onMouseLeave={() => setActiveMarker((cur) => (cur === i ? null : cur))}
                      // Set, never toggle — a tap synthesizes mouseenter first,
                      // and enter-then-toggle would flash the label off again.
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMarker(i);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${m.leftPct}%`,
                        top: `${m.topPct}%`,
                        width: size,
                        height: size,
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '50%',
                        // Same family as the in-hall minimap dots: theme dot
                        // color, starred vendors bigger + steady glow.
                        background: dot || (isStarred ? '#ffd75e' : 'rgba(212,175,55,0.85)'),
                        boxShadow: isStarred
                          ? `0 0 8px 2px ${dot ? withAlpha(dot, 0.75) : 'rgba(255,215,94,0.75)'}`
                          : '0 0 3px rgba(0,0,0,0.6)',
                        cursor: 'default',
                      }}
                    />
                  );
                })}
                {activeMarker !== null && boothMarkers[activeMarker] && (
                  <div
                    style={{
                      position: 'absolute',
                      // Clamp so labels on edge booths never spill out of the
                      // preview (matters at 375px — no horizontal scroll).
                      left: `clamp(70px, ${boothMarkers[activeMarker].leftPct}%, calc(100% - 70px))`,
                      top: `${boothMarkers[activeMarker].topPct}%`,
                      transform:
                        boothMarkers[activeMarker].topPct < 12
                          ? 'translate(-50%, 14px)'
                          : 'translate(-50%, calc(-100% - 14px))',
                      background: 'rgba(8,6,4,0.92)',
                      color: t.text,
                      border: `1px solid ${withAlpha(t.accent, 0.4)}`,
                      fontFamily: t.fontMono,
                      fontSize: 12,
                      letterSpacing: '0.06em',
                      padding: '3px 9px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      maxWidth: '60vw',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  >
                    {boothMarkers[activeMarker].name}
                  </div>
                )}
              </div>
              {boothMarkers.length > 0 && (
                <p
                  style={{
                    ...t.note,
                    fontSize: 12,
                    margin: '8px 2px 2px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ color: t.boothDot || t.accent, fontStyle: 'normal' }}>●</span> assigned booths
                  · glowing = vendors you starred
                </p>
              )}
            </div>
          )}

          <Section title="ATTENDING VENDORS">
            {show.vendors.length === 0 ? (
              <p style={{ ...t.note, fontSize: 14.5 }}>No vendors assigned to booths yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {canWalk && (
                  <p style={{ ...t.note, fontSize: 12.5, margin: '0 0 10px' }}>
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
                      borderBottom: `1px solid ${withAlpha(t.accent, 0.12)}`,
                      textDecoration: 'none',
                      color: t.text,
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
                        color: starred.has(v.id) ? t.accent : withAlpha(t.accent, 0.35),
                      }}
                    >
                      {starred.has(v.id) ? '★' : '☆'}
                    </button>
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
                      {v.name}
                    </span>
                    <span style={{ ...t.note, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {v.inventoryCount > 0
                        ? `${v.inventoryCount} item${v.inventoryCount === 1 ? '' : 's'}`
                        : ''}
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
                      VISIT →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {isOwner && (
            <Section title="EXHIBIT AT THIS SHOW">
              <p style={{ ...t.note, fontSize: 14.5, margin: 0 }}>
                This is your show — vendors apply to you, so there&rsquo;s nothing to
                apply for here.
              </p>
              <p style={{ margin: '14px 0 0' }}>
                <Link
                  href={`/organizer/show/${showId}/edit`}
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: 12.5,
                    letterSpacing: '0.18em',
                    color: t.accent,
                    textDecoration: 'none',
                  }}
                >
                  Review booth applications →
                </Link>
              </p>
            </Section>
          )}

          {!isOwner && myStores.length > 0 && (
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
                        borderBottom: `1px solid ${withAlpha(t.accent, 0.12)}`,
                      }}
                    >
                      <span style={{ fontFamily: t.fontDisplay, fontSize: 15, color: t.text, flex: 1, minWidth: 120 }}>
                        {app.vendorName}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.18em',
                          fontFamily: t.fontMono,
                          color: app.status === 'approved' ? t.accent : app.status === 'declined' ? '#b0685c' : t.muted,
                          border: `${t.borderWidth}px solid ${app.status === 'approved' ? t.accent : t.border}`,
                          borderRadius: 2,
                          padding: '3px 9px',
                        }}
                      >
                        {app.status.toUpperCase()}
                      </span>
                      {app.status === 'pending' && (
                        <button
                          onClick={() => handleWithdraw(app.id)}
                          style={{ ...t.ghostButton, padding: '5px 12px', fontSize: 11 }}
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
                      style={{ ...t.input, width: 200 }}
                    >
                      {myStores
                        .filter((s) => !myApps.some((a) => a.vendorId === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  ) : (
                    <span style={{ fontFamily: t.fontDisplay, fontSize: 14.5, color: t.text, alignSelf: 'center' }}>
                      {myStores.find((s) => !myApps.some((a) => a.vendorId === s.id))?.name}
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Message to the organizer (optional)"
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    style={{ ...t.input, flex: 1, minWidth: 220 }}
                  />
                  <button
                    onClick={handleApply}
                    disabled={applyBusy || !applyStoreId}
                    style={applyBusy ? t.primaryButtonDisabled : t.primaryButton}
                  >
                    {applyBusy ? 'APPLYING…' : 'APPLY FOR A BOOTH →'}
                  </button>
                </div>
              )}
              {applyError && <p style={{ ...t.errorText, marginTop: 12 }}>{applyError}</p>}
              <p style={{ ...t.note, fontSize: 12, marginTop: 12 }}>
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
