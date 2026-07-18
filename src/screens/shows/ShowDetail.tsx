import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useLocation } from 'wouter';
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
import { formatShowDate, lcdShowDate } from './ShowDirectory';
import { formatLocation } from '../../lib/locations';
import { Section, useTheme, withAlpha } from '../../components/themeKit';
import {
  LcdCursor, LcdDialog, lcdDialogBox, lcdMenuBox, lcdMenuRow,
} from '../../components/lcdKit';

// Lazy so /show/:id stays a light DOM page — the three.js hall chunk loads
// only when Walk is pressed.
const VendorScene = lazy(() => import('../../components/VendorScene'));

// Public shows carry no legacy per-box banners and no global tablecloth
// banner — vendors' own banners arrive via the vendors prop.
const EMPTY_BANNERS = new Map<string, string>();

// Owned by the shows workstream (Stream C).
export default function ShowDetail({ showId }: { showId: string }) {
  const t = useTheme();
  // THE HANDHELD presentation flag — every use below is style/copy only;
  // starring, application and walk logic are identical across themes.
  const lcd = t.id === 'handheld';
  const [, navigate] = useLocation();
  const backLinkStyle: CSSProperties = {
    color: t.accent,
    textDecoration: 'none',
    fontFamily: t.fontMono,
    fontSize: lcd ? 10.5 : 12.5,
    fontWeight: lcd ? 700 : undefined,
    letterSpacing: lcd ? '0.08em' : '0.18em',
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
  // Handheld vendor menu rows: hover/focus = inversion (never hue).
  const [hotVendor, setHotVendor] = useState<string | null>(null);

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

  // The booth-application flow body — rendered as-is for the classic themes,
  // wrapped in the LCD dialog box ("WANT TO SELL HERE?") for handheld. Only
  // presentation branches on `lcd`; the apply/withdraw logic is shared.
  const applyBody = (
    <>
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
                borderBottom: lcd ? `2px solid ${t.surface}` : `1px solid ${withAlpha(t.accent, 0.12)}`,
              }}
            >
              <span
                style={{
                  fontFamily: t.fontDisplay,
                  fontSize: lcd ? 11 : 15,
                  fontWeight: lcd ? 700 : undefined,
                  color: t.text,
                  flex: 1,
                  minWidth: 120,
                }}
              >
                {app.vendorName}
              </span>
              <span
                style={lcd ? {
                  // LCD status chips: approved = inverted, others = weight
                  // and border — never hue.
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  fontFamily: t.fontMono,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  padding: '3px 8px',
                  borderRadius: 0,
                  ...(app.status === 'approved'
                    ? { background: t.accent, color: t.accentContrast, border: `2px solid ${t.accent}` }
                    : app.status === 'declined'
                      ? { color: t.muted, border: `2px solid ${t.muted}` }
                      : { color: t.text, border: `2px solid ${t.text}` }),
                } : {
                  fontSize: 10.5,
                  letterSpacing: '0.18em',
                  fontFamily: t.fontMono,
                  color: app.status === 'approved' ? t.accent : app.status === 'declined' ? '#b0685c' : t.muted,
                  border: `${t.borderWidth}px solid ${app.status === 'approved' ? t.accent : t.border}`,
                  borderRadius: 2,
                  padding: '3px 9px',
                }}
              >
                {lcd && app.status === 'approved' ? 'APPROVED!' : app.status.toUpperCase()}
              </span>
              {app.status === 'pending' && (
                <button
                  onClick={() => handleWithdraw(app.id)}
                  style={{ ...t.ghostButton, padding: '5px 12px', fontSize: lcd ? 10 : 11 }}
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
            <span
              style={{
                fontFamily: t.fontDisplay,
                fontSize: lcd ? 11 : 14.5,
                fontWeight: lcd ? 700 : undefined,
                color: t.text,
                alignSelf: 'center',
              }}
            >
              {myStores.find((s) => !myApps.some((a) => a.vendorId === s.id))?.name}
            </span>
          )}
          <input
            type="text"
            placeholder={lcd ? 'MESSAGE TO THE ORGANIZER (OPTIONAL)' : 'Message to the organizer (optional)'}
            value={applyMessage}
            onChange={(e) => setApplyMessage(e.target.value)}
            style={{ ...t.input, flex: 1, minWidth: 220 }}
          />
          <button
            onClick={handleApply}
            disabled={applyBusy || !applyStoreId}
            style={applyBusy ? t.primaryButtonDisabled : t.primaryButton}
          >
            {lcd
              ? (applyBusy ? 'APPLYING…' : '▶ APPLY FOR A BOOTH')
              : (applyBusy ? 'APPLYING…' : 'APPLY FOR A BOOTH →')}
          </button>
        </div>
      )}
      {applyError && (
        <p style={{ ...t.errorText, marginTop: 12 }}>{lcd ? `! ${applyError}` : applyError}</p>
      )}
      <p style={{ ...t.note, fontSize: lcd ? 9.5 : 12, marginTop: 12 }}>
        The organizer reviews applications and assigns booths — approval appears here
        and your store shows up on the floor plan once placed.
      </p>
    </>
  );

  // The 2D plan preview with booth markers — shared by the classic body and
  // the handheld two-column body (#6c) so the marker math never forks. The
  // in-box legend renders for classic themes; handheld puts its legend line
  // outside, under the box.
  const planPreview = show?.planUrl ? (
    <div
      style={{
        border: lcd ? `3px solid ${t.border}` : `${t.borderWidth}px solid ${t.border}`,
        borderRadius: lcd ? 0 : 2,
        padding: 8,
        background: lcd ? t.surface : t.panel,
        marginBottom: lcd ? 10 : 38,
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
          const size = lcd ? (isStarred ? 14 : 10) : isStarred ? 13 : 9;
          // '' = keep today's gold dots (refined); night/lobby recolor.
          // Handheld: square ink pixels, starred = bigger square with
          // a screen-colored ring (inversion, never glow).
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
                borderRadius: lcd ? 0 : '50%',
                // Same family as the in-hall minimap dots: theme dot
                // color, starred vendors bigger + steady glow.
                background: dot || (isStarred ? '#ffd75e' : 'rgba(212,175,55,0.85)'),
                boxShadow: lcd
                  ? isStarred
                    ? `0 0 0 2px ${t.accentContrast}`
                    : 'none'
                  : isStarred
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
              whiteSpace: 'nowrap',
              maxWidth: '60vw',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'none',
              zIndex: 2,
              ...(lcd
                ? {
                    // Inverted name chip — no dark scrim on the LCD.
                    background: t.accent,
                    color: t.accentContrast,
                    fontFamily: t.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    padding: '3px 8px',
                    borderRadius: 0,
                  }
                : {
                    background: 'rgba(8,6,4,0.92)',
                    color: t.text,
                    border: `1px solid ${withAlpha(t.accent, 0.4)}`,
                    fontFamily: t.fontMono,
                    fontSize: 12,
                    letterSpacing: '0.06em',
                    padding: '3px 9px',
                    borderRadius: 4,
                  }),
            }}
          >
            {boothMarkers[activeMarker].name}
          </div>
        )}
      </div>
      {boothMarkers.length > 0 && !lcd && (
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
  ) : null;

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

  // #6c: the LCD title row carries "AUG 15 · SACRAMENTO, CA" on its right.
  const lcdCityState = show ? [show.city, show.state].filter(Boolean).join(', ') : '';
  const lcdAside = lcd && show ? (
    <span
      style={{
        fontFamily: t.fontMono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        color: t.muted,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {[lcdShowDate(show.showDate), lcdCityState].filter(Boolean).join(' · ')}
    </span>
  ) : undefined;

  return (
    <PageShell title={show?.name ?? 'Show'} eyebrow="PUBLIC EXHIBITION" aside={lcdAside}>
      {show === undefined && <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>Loading show…</p>}

      {show === null && (lcd ? (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <LcdDialog
            cursor
            choices={[
              { label: 'ALL CARD SHOWS', onClick: () => navigate('/shows'), primary: true },
            ]}
          >
            {isSupabaseConfigured
              ? "THIS SHOW ISN'T PUBLISHED — OR DOESN'T EXIST AT ALL!"
              : 'NO SHOW DIRECTORY HERE — THIS BUILD RUNS OFFLINE!'}
          </LcdDialog>
        </div>
      ) : (
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
      ))}

      {/* ------------------------------------------------------ THE HANDHELD
          #6c two-column body: floor plan + legend + WALK left, the VENDORS
          panel + apply dialog right. Date/location live in the header aside;
          the slim strip below carries the remaining logistics. Starring,
          application and walk logic are the same handlers as the classic
          body. */}
      {show && lcd && (
        <>
          {((walks !== null && walks >= 1) || show.venueName || formatLocation(show) || show.address
            || show.hours || show.admission || show.externalUrl) && (
            <div
              style={{
                margin: '0 0 16px',
                fontSize: 10,
                lineHeight: 1.9,
                color: t.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {walks !== null && walks >= 1 && (
                <span style={{ ...t.chip, marginRight: 10 }}>
                  ◈ {walks} WALK{walks === 1 ? '' : 'S'}
                </span>
              )}
              {(show.venueName || formatLocation(show)) && (
                <span style={{ marginRight: 10 }}>
                  {[show.venueName, formatLocation(show)].filter(Boolean).join(' · ')}
                </span>
              )}
              {show.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: t.text, textDecoration: 'underline', marginRight: 10 }}
                >
                  {show.address} ↗
                </a>
              )}
              {(show.hours || show.admission) && (
                <span style={{ marginRight: 10 }}>
                  {[show.hours, show.admission].filter(Boolean).join(' · ')}
                </span>
              )}
              {show.externalUrl && (
                <a
                  href={show.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: t.text, fontWeight: 700, textDecoration: 'underline' }}
                >
                  SHOW WEBSITE / TICKETS ▶
                </a>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-start' }}>
            {/* Left column: the map is the hero. */}
            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
              {planPreview}
              {show.planUrl && boothMarkers.length > 0 && (
                <p style={{ margin: '0 0 12px', fontSize: 9.5, letterSpacing: '0.08em', color: t.muted, textTransform: 'uppercase' }}>
                  ■ = BOOTH · ★ = STARRED · PRESS ▶ TO WALK
                </p>
              )}
              <button
                onClick={handleWalk}
                disabled={!canWalk}
                style={{
                  ...(canWalk ? t.primaryButton : t.primaryButtonDisabled),
                  width: '100%',
                  padding: '13px 20px',
                  fontSize: 12,
                }}
              >
                ▶ WALK THIS SHOW
              </button>
              {!canWalk && (
                <p style={{ ...t.note, fontSize: 10, margin: '10px 0 0' }}>
                  NO MAP YET! THE ORGANIZER HASN&rsquo;T UPLOADED A FLOOR PLAN.
                </p>
              )}
              {isOwner && (
                <p style={{ margin: '12px 0 0' }}>
                  <Link
                    href={`/organizer/show/${showId}/edit`}
                    style={{ fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: t.accent, textDecoration: 'none' }}
                  >
                    ✎ EDIT THIS SHOW ▶
                  </Link>
                </p>
              )}
            </div>

            {/* Right column: — VENDORS (N) — then the apply dialog. */}
            <div style={{ flex: '1 1 250px', minWidth: 0 }}>
              <div
                style={{
                  textAlign: 'center',
                  fontFamily: t.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: t.text,
                  margin: '0 0 8px',
                  textTransform: 'uppercase',
                }}
              >
                — VENDORS ({show.vendors.length}) —
              </div>
              {show.vendors.length === 0 ? (
                <LcdDialog>NO VENDORS AT THE TABLES YET!</LcdDialog>
              ) : (
                <div style={lcdMenuBox}>
                  {show.vendors.map((v) => {
                    const hot = hotVendor === v.id;
                    return (
                      <Link
                        key={v.id}
                        href={`/vendor/${v.id}`}
                        onMouseEnter={() => setHotVendor(v.id)}
                        onMouseLeave={() => setHotVendor((c) => (c === v.id ? null : c))}
                        onFocus={() => setHotVendor(v.id)}
                        onBlur={() => setHotVendor((c) => (c === v.id ? null : c))}
                        style={{ ...lcdMenuRow(hot), textDecoration: 'none' }}
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
                            fontSize: 13,
                            lineHeight: 1,
                            padding: '0 2px',
                            color: hot ? t.accentContrast : starred.has(v.id) ? t.text : t.muted,
                          }}
                        >
                          {starred.has(v.id) ? '★' : '☆'}
                        </button>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 10.5,
                            fontWeight: 700,
                          }}
                        >
                          {v.name}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 400,
                            whiteSpace: 'nowrap',
                            color: hot ? t.accentContrast : t.muted,
                          }}
                        >
                          {v.inventoryCount > 0 ? v.inventoryCount : '—'}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
              {canWalk && show.vendors.length > 0 && (
                <p style={{ ...t.note, fontSize: 9, margin: '8px 0 0' }}>
                  ★ STARRED BOOTHS GROW BIG ON THE HALL MAP!
                </p>
              )}
              {isOwner ? (
                <LcdDialog
                  style={{ marginTop: 16 }}
                  choices={[
                    {
                      label: 'REVIEW BOOTH APPLICATIONS',
                      onClick: () => navigate(`/organizer/show/${showId}/edit`),
                      primary: true,
                    },
                  ]}
                >
                  THIS IS YOUR SHOW! VENDORS APPLY TO YOU.
                </LcdDialog>
              ) : myStores.length > 0 ? (
                <div style={{ ...lcdDialogBox, marginTop: 16 }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
                    WANT TO SELL HERE? APPLY WITH YOUR STORE!
                  </p>
                  {applyBody}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <Link href="/shows" style={backLinkStyle}>
              ◀ ALL CARD SHOWS
            </Link>
            <ShareButton title={show.name} />
          </div>
        </>
      )}

      {show && !lcd && (
        <>
          <div
            style={{
              border: `${t.borderWidth}px solid ${t.border}`,
              borderRadius: lcd ? 0 : 4,
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
                  letterSpacing: lcd ? '0.08em' : '0.22em',
                  padding: '3px 10px',
                  marginBottom: 12,
                }}
              >
                ◈ WALKABLE IN 3D
              </div>
            )}
            {walks !== null && walks >= 1 && (
              <div
                style={lcd ? {
                  // Handheld: the walk counter is a chip ("◈ N WALKS").
                  ...t.chip,
                  display: 'inline-block',
                  padding: '3px 10px',
                  marginBottom: 12,
                  marginLeft: canWalk ? 8 : 0,
                } : {
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
            <div
              style={{
                fontFamily: t.fontDisplay,
                fontSize: lcd ? 12 : 17,
                fontWeight: lcd ? 700 : undefined,
                letterSpacing: lcd ? '0.06em' : '0.05em',
                color: t.text,
              }}
            >
              {formatShowDate(show.showDate) ?? 'Date to be announced'}
            </div>
            {(show.venueName || formatLocation(show)) && (
              <div style={{ ...t.note, fontSize: lcd ? 10 : 14, marginTop: 7 }}>
                {[show.venueName, formatLocation(show)].filter(Boolean).join(' · ')}
              </div>
            )}
            {show.address && (
              <div style={{ marginTop: 7 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...t.note,
                    fontSize: lcd ? 10 : 13.5,
                    color: t.accent,
                    textDecoration: lcd ? 'underline' : 'none',
                  }}
                >
                  {show.address} ↗
                </a>
              </div>
            )}
            {(show.hours || show.admission) && (
              <div style={{ ...t.note, fontSize: lcd ? 10 : 13.5, marginTop: 7 }}>
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
                    fontSize: lcd ? 10 : 12,
                    fontWeight: lcd ? 700 : undefined,
                    letterSpacing: lcd ? '0.08em' : '0.18em',
                    color: t.accent,
                    textDecoration: lcd ? 'underline' : 'none',
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
                padding: lcd ? '13px 32px' : '14px 44px',
                fontSize: lcd ? 12 : 14,
              }}
            >
              {lcd ? '▶ WALK THIS SHOW' : 'WALK THIS SHOW →'}
            </button>
            {isOwner && (
              <div style={{ marginTop: 14 }}>
                <Link
                  href={`/organizer/show/${showId}/edit`}
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: lcd ? 10.5 : 12.5,
                    fontWeight: lcd ? 700 : undefined,
                    letterSpacing: lcd ? '0.08em' : '0.18em',
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
            <p style={{ ...t.note, fontSize: lcd ? 10 : 14, margin: '0 0 26px', textAlign: 'center' }}>
              {lcd
                ? "NO MAP YET! THE ORGANIZER HASN'T UPLOADED A FLOOR PLAN."
                : "This show has no walkable floor plan yet — the organizer hasn't uploaded one."}
            </p>
          )}

          {planPreview}

          <Section title="ATTENDING VENDORS">
            {show.vendors.length === 0 ? (
              lcd ? (
                <LcdDialog style={{ maxWidth: 460 }}>NO VENDORS AT THE TABLES YET!</LcdDialog>
              ) : (
                <p style={{ ...t.note, fontSize: 14.5 }}>No vendors assigned to booths yet.</p>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {canWalk && (
                  <p style={{ ...t.note, fontSize: lcd ? 9.5 : 12.5, margin: '0 0 10px' }}>
                    {lcd
                      ? '★ star the vendors you want to visit — their booths grow big on the hall map!'
                      : '★ Star the vendors you want to visit — their booths glow on the map when you walk the show.'}
                  </p>
                )}
                {lcd ? (
                  // Handheld: the vendor list is a MENU — inverted row on
                  // hover/focus, ▶ cursor, star toggle kept fully functional.
                  <div style={lcdMenuBox}>
                    {show.vendors.map((v) => {
                      const hot = hotVendor === v.id;
                      return (
                        <Link
                          key={v.id}
                          href={`/vendor/${v.id}`}
                          onMouseEnter={() => setHotVendor(v.id)}
                          onMouseLeave={() => setHotVendor((c) => (c === v.id ? null : c))}
                          onFocus={() => setHotVendor(v.id)}
                          onBlur={() => setHotVendor((c) => (c === v.id ? null : c))}
                          style={{ ...lcdMenuRow(hot), textDecoration: 'none' }}
                        >
                          <LcdCursor active={hot} />
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
                              fontSize: 13,
                              lineHeight: 1,
                              padding: '0 2px',
                              color: hot ? t.accentContrast : starred.has(v.id) ? t.text : t.muted,
                            }}
                          >
                            {starred.has(v.id) ? '★' : '☆'}
                          </button>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 11,
                            }}
                          >
                            {v.name}
                          </span>
                          {v.inventoryCount > 0 && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 400,
                                whiteSpace: 'nowrap',
                                color: hot ? t.accentContrast : t.muted,
                              }}
                            >
                              {v.inventoryCount} ITEM{v.inventoryCount === 1 ? '' : 'S'}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  show.vendors.map((v) => (
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
                  ))
                )}
              </div>
            )}
          </Section>

          {isOwner && (
            <Section title="EXHIBIT AT THIS SHOW">
              {lcd ? (
                <LcdDialog
                  choices={[
                    {
                      label: 'REVIEW BOOTH APPLICATIONS',
                      onClick: () => navigate(`/organizer/show/${showId}/edit`),
                      primary: true,
                    },
                  ]}
                >
                  THIS IS YOUR SHOW! VENDORS APPLY TO YOU — NOTHING TO APPLY FOR HERE.
                </LcdDialog>
              ) : (
                <>
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
                </>
              )}
            </Section>
          )}

          {!isOwner && myStores.length > 0 && (
            <Section title="EXHIBIT AT THIS SHOW">
              {lcd ? (
                <div style={lcdDialogBox}>
                  <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
                    WANT TO SELL HERE? APPLY WITH YOUR STORE!
                  </p>
                  {applyBody}
                </div>
              ) : (
                applyBody
              )}
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
