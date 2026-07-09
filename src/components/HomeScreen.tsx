import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../lib/auth';
import { cardDetailsLine } from '../lib/cardMeta';
import { orderForWalls, hiddenFromWalls } from '../lib/wallOrder';
import type { CardWithUrl } from '../lib/useCards';
import type { CardPatch, SavedPlanRecord } from '../lib/db';
import type { VendorSummary } from '../lib/useVendors';
import {
  GOLD, BG, PANEL, HAIRLINE, TEXT, MUTED, SERIF, SANS,
  Ornament, QuickAction, Section, museumHoverCss, ghostButtonStyle,
} from './museumKit';

// Home screen — the "Museum Refined" design (graduated from the 2026-07 UI
// Lab beta): upload cards, manage the banner, and enter either 3D experience.
// Serves two hosts: the signed-in home (default route) and the /sandbox page
// (`sandbox` — the local, no-account experience with its own banner/chrome).
// Logged-out visitors on a configured deployment never reach this component;
// they get LandingScreen instead.

interface HomeScreenProps {
  cards: CardWithUrl[];
  loading: boolean;
  onAdd: (file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Card details editor (name / set / number / year / grade / notes). */
  onUpdateCard: (id: string, patch: CardPatch) => Promise<void>;
  bannerUrl: string | null;
  onSetBanner: (file: File) => Promise<void>;
  onRemoveBanner: () => Promise<void>;
  savedPlans: SavedPlanRecord[];
  vendors: VendorSummary[];
  /** Whose collection hangs in the gallery: null = own cards, else vendor id. */
  galleryVendorId: string | null;
  onSelectGalleryVendor: (id: string | null) => void;
  onWalkPlan: (id: string) => Promise<void>;
  onEnter: () => void;
  onVendor: () => void;
  onVendors: () => void;
  /** Sandbox page mode: local-only banner, back-to-main link, no auth corner. */
  sandbox?: boolean;
  /** Show the Vendor Registry CTA (vendors; always on in sandbox/guest-only). */
  showRegistry?: boolean;
  /** Show the organizer-tools CTA (organizer accounts). */
  showOrganizer?: boolean;
}

/** Compact control chip on curate-mode tiles — same idiom as the ✎/✕
 *  corner buttons, laid out as a row under the tile. */
const curateBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  color: TEXT,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '3px',
  minWidth: '24px',
  height: '22px',
  cursor: 'pointer',
  fontSize: '11px',
  lineHeight: '20px',
  textAlign: 'center',
  padding: '0 5px',
};

const cardFieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#171310',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '3px',
  color: TEXT,
  padding: '6px 8px',
  fontSize: '11.5px',
  fontFamily: SERIF,
  marginTop: '5px',
};

/** The editor's text fields — CardPatch minus the curation flags (those are
 *  boolean/number and belong to the curate-the-walls controls, not inputs). */
type CardTextKey = 'name' | 'setName' | 'cardNumber' | 'year' | 'grade' | 'notes';

/** Per-card details editor (museum placard fields). Save-on-blur per field. */
function CardDetailsEditor({
  card,
  onSave,
}: {
  card: CardWithUrl;
  onSave: (id: string, patch: CardPatch) => void;
}) {
  const [draft, setDraft] = useState<Record<CardTextKey, string>>({
    name: card.name,
    setName: card.setName ?? '',
    cardNumber: card.cardNumber ?? '',
    year: card.year ?? '',
    grade: card.grade ?? '',
    notes: card.notes ?? '',
  });

  const commit = (key: CardTextKey) => {
    const next = draft[key].trim();
    const current = (key === 'name' ? card.name : card[key]) ?? '';
    if (key === 'name' && !next) {
      setDraft((d) => ({ ...d, name: card.name })); // never save an empty name
      return;
    }
    if (next !== current) onSave(card.id, { [key]: next });
  };

  const field = (key: CardTextKey, placeholder: string) => (
    <input
      type="text"
      value={draft[key]}
      placeholder={placeholder}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => commit(key)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={cardFieldStyle}
    />
  );

  return (
    <div style={{ marginTop: '4px' }}>
      {field('name', 'Card name')}
      {field('setName', 'Set (e.g. Base Set)')}
      {field('cardNumber', 'Number (e.g. 4/102)')}
      {field('year', 'Year')}
      {field('grade', 'Grade (e.g. PSA 9)')}
      {field('notes', 'Notes')}
    </div>
  );
}

export default function HomeScreen({
  cards,
  loading,
  onAdd,
  onRemove,
  onUpdateCard,
  bannerUrl,
  onSetBanner,
  onRemoveBanner,
  savedPlans,
  vendors,
  galleryVendorId,
  onSelectGalleryVendor,
  onWalkPlan,
  onEnter,
  onVendor,
  onVendors,
  sandbox = false,
  showRegistry = true,
  showOrganizer = false,
}: HomeScreenProps) {
  const [, navigate] = useLocation();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walkingId, setWalkingId] = useState<string | null>(null);
  // Which card's details editor is open (✎ on the tile)
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  // Curate-the-walls mode: tiles show in wall order with ★ / ‹ › / HIDE
  // controls instead of the ✎/✕ pair
  const [curating, setCurating] = useState(false);

  // Wall order (featured first, hangOrder, addedAt) and the hidden remainder
  const wallCards = useMemo(() => orderForWalls(cards), [cards]);
  const offWallCards = useMemo(() => hiddenFromWalls(cards), [cards]);

  /** Swap two adjacent on-wall cards. If any on-wall card still lacks a
   *  hangOrder, first materialize hangOrder = index for ALL of them in the
   *  current wall order (quiet sequential writes), then swap. Side-effect
   *  calls stay OUTSIDE React state updaters (StrictMode double-invokes
   *  updaters — see CLAUDE.md). */
  const moveOnWall = useCallback(async (index: number, dir: -1 | 1) => {
    const list = wallCards;
    const j = index + dir;
    if (index < 0 || index >= list.length || j < 0 || j >= list.length) return;
    const needsInit = list.some((c) => c.hangOrder === undefined);
    if (needsInit) {
      for (let i = 0; i < list.length; i++) {
        await onUpdateCard(list[i].id, { hangOrder: i });
      }
    }
    const orderA = needsInit ? index : (list[index].hangOrder ?? index);
    const orderB = needsInit ? j : (list[j].hangOrder ?? j);
    await onUpdateCard(list[index].id, { hangOrder: orderB });
    await onUpdateCard(list[j].id, { hangOrder: orderA });
  }, [wallCards, onUpdateCard]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await onAdd(file);
      }
    }
    setUploading(false);
  }, [onAdd]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleWalk = useCallback(async (id: string) => {
    setWalkingId(id);
    try {
      await onWalkPlan(id);
    } finally {
      setWalkingId(null);
    }
  }, [onWalkPlan]);

  const planSummaries = useMemo(() => savedPlans.map((p) => {
    let booths = 0;
    try {
      booths = (JSON.parse(p.metaJson) as { rects: unknown[] }).rects.length;
    } catch { /* corrupt meta — show 0 */ }
    return {
      id: p.id,
      name: p.name,
      detail: [
        `${booths} booths`,
        p.showDate ? `show ${p.showDate}` : null,
        `saved ${new Date(p.updatedAt).toLocaleDateString()}`,
      ].filter(Boolean).join(' · '),
    };
  }), [savedPlans]);

  const countsLine = [
    `${cards.length} ${cards.length === 1 ? 'WORK' : 'WORKS'}`,
    bannerUrl ? 'BANNER SET' : 'NO BANNER',
    `${savedPlans.length} SAVED ${savedPlans.length === 1 ? 'PLAN' : 'PLANS'}`,
    `${vendors.length} ${vendors.length === 1 ? 'VENDOR' : 'VENDORS'}`,
  ].join(' · ');

  const { configured: authConfigured, session } = useAuth();

  // Vendors with inventory can hang their collection in the gallery
  const showableVendors = vendors.filter((v) => v.inventoryCount > 0);
  const galleryVendor = showableVendors.find((v) => v.id === galleryVendorId) ?? null;
  const canEnter = galleryVendor ? galleryVendor.inventoryCount > 0 : cards.length > 0;

  return (
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: BG, color: TEXT, fontFamily: SANS, position: 'relative' }}>
      {/* Sandbox: back to the main site. Otherwise: auth corner (hidden when
          accounts aren't configured). */}
      {sandbox ? (
        <div style={{ position: 'absolute', top: 18, left: 22, fontFamily: SERIF, fontSize: 12, letterSpacing: '0.12em' }}>
          <Link href="/" style={{ color: GOLD, textDecoration: 'none' }}>
            ← VENDOR MUSEUM
          </Link>
        </div>
      ) : authConfigured && (
        <div style={{ position: 'absolute', top: 18, right: 22, fontFamily: SERIF, fontSize: 12, letterSpacing: '0.12em' }}>
          <Link
            href={session ? '/account' : '/login'}
            style={{ color: GOLD, textDecoration: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: '999px', padding: '8px 18px' }}
          >
            {session ? (session.user.email ?? 'MY ACCOUNT') : 'SIGN IN'}
          </Link>
        </div>
      )}
      <style>{museumHoverCss}</style>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '64px 28px 80px' }}>
        {/* Masthead */}
        <header style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.4em', color: MUTED, marginBottom: '14px' }}>
            {sandbox ? 'LOCAL SANDBOX · THIS BROWSER ONLY' : 'EST. 2026 · PRIVATE COLLECTION'}
          </div>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: '44px', fontWeight: 400, letterSpacing: '0.18em', color: GOLD }}>
            VENDOR MUSEUM
          </h1>
          <div style={{ margin: '18px 0' }}>
            <Ornament />
          </div>
          <p style={{ margin: 0, fontSize: '13.5px', color: MUTED, letterSpacing: '0.12em' }}>
            {loading ? 'OPENING THE ARCHIVES…' : countsLine}
          </p>
          {sandbox && (
            <div style={{
              margin: '22px auto 0', maxWidth: 560,
              border: `1px solid ${HAIRLINE}`, borderRadius: '4px',
              background: 'rgba(212,175,55,0.05)', padding: '10px 18px',
              fontSize: '12.5px', lineHeight: 1.6, color: MUTED, fontFamily: SERIF, fontStyle: 'italic',
            }}>
              Everything on this page lives in this browser — no account required.
              Collections and shows built here can't be shared or published
              {authConfigured && (
                <>
                  {' '}(<Link href="/signup" style={{ color: GOLD }}>create an account</Link> to
                  take them online)
                </>
              )}.
            </div>
          )}
          {showableVendors.length > 0 && (
            <div style={{ marginTop: '28px' }}>
              <span style={{ fontSize: '11px', letterSpacing: '0.14em', color: MUTED, marginRight: '10px' }}>
                ON THE WALLS
              </span>
              <select
                value={galleryVendor?.id ?? ''}
                onChange={(e) => onSelectGalleryVendor(e.target.value || null)}
                style={{
                  background: '#0d0b0a', color: TEXT, border: `1px solid ${HAIRLINE}`,
                  borderRadius: '2px', padding: '8px 12px', fontSize: '13px',
                  fontFamily: SERIF, letterSpacing: '0.04em', cursor: 'pointer',
                }}
              >
                <option value="">My Collection · {cards.length} {cards.length === 1 ? 'work' : 'works'}</option>
                {showableVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.inventoryCount} {v.inventoryCount === 1 ? 'item' : 'items'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={onEnter}
            disabled={!canEnter}
            style={{
              marginTop: showableVendors.length > 0 ? '16px' : '30px',
              background: canEnter ? GOLD : '#332b1e',
              color: canEnter ? '#1a1614' : '#7a6c50',
              border: 'none', padding: '15px 46px',
              fontSize: '14px', letterSpacing: '0.16em', fontFamily: SERIF,
              cursor: canEnter ? 'pointer' : 'not-allowed', borderRadius: '2px',
            }}
          >
            ENTER THE GALLERY →
          </button>
          {!canEnter && !loading && (
            <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED, fontStyle: 'italic', fontFamily: SERIF }}>
              Submit at least one work to open the gallery
            </p>
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
            {authConfigured && (
              <QuickAction
                label="EXPLORE CARD SHOWS →"
                sub="browse published shows by location and walk them"
                onClick={() => navigate('/shows')}
              />
            )}
            <QuickAction
              label="BUILD A SHOW →"
              sub={sandbox || !authConfigured
                ? 'floor-plan editor, this browser only'
                : 'draft a floor plan and walk it in 3D'}
              onClick={onVendor}
            />
            {authConfigured && !sandbox && (
              <QuickAction
                label="VENDOR DIRECTORY →"
                sub="registered vendors across the platform"
                onClick={() => navigate('/vendors')}
              />
            )}
            {showRegistry && (
              <QuickAction
                label="VENDOR REGISTRY →"
                sub={sandbox || !authConfigured
                  ? 'local vendors and their inventory'
                  : 'manage your stores and inventory'}
                onClick={onVendors}
              />
            )}
            {showOrganizer && !sandbox && (
              <QuickAction
                label="ORGANIZER TOOLS →"
                sub="create and manage your public shows"
                onClick={() => navigate('/organizer')}
              />
            )}
          </div>
        </header>

        <Section numeral="I." title="ACQUISITIONS">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('home-file-input')?.click()}
            style={{
              border: `1px dashed ${dragging ? GOLD : HAIRLINE}`,
              borderRadius: '4px', padding: '32px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'rgba(212,175,55,0.08)' : PANEL,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontFamily: SERIF, fontSize: '15px', letterSpacing: '0.04em' }}>
              {uploading ? 'Cataloguing new works…' : 'Submit new works to the collection'}
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '8px', letterSpacing: '0.06em' }}>
              Drop images here, or click to browse — PNG, JPG, WebP
            </div>
            <input
              id="home-file-input"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </Section>

        <Section numeral="II." title="THE COLLECTION">
          {!loading && cards.length === 0 && (
            <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: '13.5px', color: MUTED }}>
              The walls are bare — submit your first work above.
            </p>
          )}
          {cards.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '14px', flexWrap: 'wrap', margin: '-6px 0 18px',
            }}>
              {curating ? (
                <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '12px', color: MUTED }}>
                  ★ featured works hang first · ‹ › set the order · hidden works stay in the binder
                </span>
              ) : <span />}
              <button
                onClick={() => setCurating((c) => !c)}
                style={{
                  ...ghostButtonStyle,
                  padding: '8px 18px',
                  fontSize: '11px',
                  ...(curating ? { border: `1px solid ${GOLD}` } : {}),
                }}
              >
                {curating ? 'DONE CURATING' : 'CURATE THE WALLS'}
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '20px' }}>
            {(curating
              ? [
                  ...wallCards.map((card, i) => ({ card, wallIndex: i, hidden: false })),
                  ...offWallCards.map((card) => ({ card, wallIndex: -1, hidden: true })),
                ]
              : cards.map((card) => ({ card, wallIndex: -1, hidden: false }))
            ).map(({ card, wallIndex, hidden }) => (
              <figure key={card.id} className="museum-lift" style={{ margin: 0, position: 'relative' }}>
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  style={{
                    width: '100%', aspectRatio: '2.5/3.5', objectFit: 'cover', display: 'block',
                    borderRadius: '2px', border: '3px solid #3a2f1e',
                    outline: `1px solid ${HAIRLINE}`, outlineOffset: '3px',
                    boxSizing: 'border-box',
                    opacity: hidden ? 0.45 : 1,
                  }}
                />
                {!curating && (
                  <>
                    <button
                      onClick={() => onRemove(card.id)}
                      title="Remove from collection"
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'rgba(0,0,0,0.75)', color: TEXT, border: `1px solid ${HAIRLINE}`,
                        borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
                        fontSize: '11px', lineHeight: '20px', textAlign: 'center', padding: 0,
                      }}
                    >
                      ✕
                    </button>
                    <button
                      onClick={() => setEditingCardId(editingCardId === card.id ? null : card.id)}
                      title="Edit card details (set, number, year, grade)"
                      style={{
                        position: 'absolute', top: '6px', left: '6px',
                        background: 'rgba(0,0,0,0.75)',
                        color: editingCardId === card.id ? GOLD : TEXT,
                        border: `1px solid ${editingCardId === card.id ? GOLD : HAIRLINE}`,
                        borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
                        fontSize: '11px', lineHeight: '20px', textAlign: 'center', padding: 0,
                      }}
                    >
                      ✎
                    </button>
                  </>
                )}
                {curating && hidden && (
                  <span style={{
                    position: 'absolute', top: '6px', left: '6px',
                    background: 'rgba(0,0,0,0.8)', color: MUTED, border: `1px solid ${HAIRLINE}`,
                    borderRadius: '3px', padding: '2px 6px',
                    fontSize: '9px', letterSpacing: '0.12em',
                  }}>
                    OFF THE WALLS
                  </span>
                )}
                {curating && (
                  <div style={{
                    display: 'flex', gap: '4px', justifyContent: 'center',
                    marginTop: '9px', flexWrap: 'wrap',
                  }}>
                    <button
                      onClick={() => onUpdateCard(card.id, { featured: !card.featured })}
                      title={card.featured ? 'Un-feature' : 'Feature — hangs first on the walls'}
                      style={{
                        ...curateBtnStyle,
                        color: card.featured ? GOLD : TEXT,
                        border: `1px solid ${card.featured ? GOLD : HAIRLINE}`,
                      }}
                    >
                      {card.featured ? '★' : '☆'}
                    </button>
                    {!hidden && (
                      <>
                        <button
                          onClick={() => moveOnWall(wallIndex, -1)}
                          disabled={wallIndex <= 0}
                          title="Hang earlier"
                          style={{
                            ...curateBtnStyle,
                            opacity: wallIndex <= 0 ? 0.35 : 1,
                            cursor: wallIndex <= 0 ? 'default' : 'pointer',
                          }}
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => moveOnWall(wallIndex, 1)}
                          disabled={wallIndex >= wallCards.length - 1}
                          title="Hang later"
                          style={{
                            ...curateBtnStyle,
                            opacity: wallIndex >= wallCards.length - 1 ? 0.35 : 1,
                            cursor: wallIndex >= wallCards.length - 1 ? 'default' : 'pointer',
                          }}
                        >
                          ›
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onUpdateCard(card.id, { onWalls: card.onWalls === false })}
                      title={hidden ? 'Hang this work on the walls' : 'Take off the walls (stays in the binder)'}
                      style={{ ...curateBtnStyle, letterSpacing: '0.08em', fontSize: '9.5px' }}
                    >
                      {hidden ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>
                )}
                <figcaption style={{
                  marginTop: curating ? '8px' : '10px', textAlign: 'center', fontFamily: SERIF, fontSize: '11.5px',
                  fontStyle: 'italic', color: MUTED,
                }}>
                  <span style={{
                    display: 'block',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {card.name}
                  </span>
                  {cardDetailsLine(card) && (
                    <span style={{
                      display: 'block', marginTop: '3px', fontSize: '10.5px',
                      fontStyle: 'normal', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {cardDetailsLine(card)}
                    </span>
                  )}
                </figcaption>
                {!curating && editingCardId === card.id && (
                  <CardDetailsEditor card={card} onSave={onUpdateCard} />
                )}
              </figure>
            ))}
          </div>
        </Section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0 40px' }}>
          <Section numeral="III." title="EXHIBITIONS">
            {planSummaries.length === 0 && (
              <p style={{ margin: '0 0 14px', fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px', color: MUTED }}>
                No saved floor plans yet.
              </p>
            )}
            {planSummaries.map((p) => (
              <div
                key={p.id}
                className="museum-row"
                onClick={() => { if (!walkingId) handleWalk(p.id); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '13px 10px', borderBottom: '1px solid rgba(212,175,55,0.12)',
                  cursor: walkingId ? 'wait' : 'pointer',
                  opacity: walkingId && walkingId !== p.id ? 0.5 : 1,
                }}
              >
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: '14px' }}>{p.name}</div>
                  <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '2px' }}>{p.detail}</div>
                </div>
                <span style={{ color: GOLD, fontSize: '13px', whiteSpace: 'nowrap' }}>
                  {walkingId === p.id ? 'Opening…' : 'Walk →'}
                </span>
              </div>
            ))}
            <div
              className="museum-row"
              onClick={onVendor}
              style={{ padding: '13px 10px', cursor: 'pointer', fontSize: '12.5px', color: MUTED, letterSpacing: '0.06em' }}
            >
              + Upload or edit a floor plan
            </div>
          </Section>

          <Section numeral="IV." title="TABLECLOTH BANNER">
            <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '12px', letterSpacing: '0.06em' }}>
              Displayed on the front of your vendor table — plain cloth if empty.
            </div>
            <div
              onClick={() => document.getElementById('home-banner-input')?.click()}
              style={{
                position: 'relative', borderRadius: '2px', border: `1px ${bannerUrl ? 'solid' : 'dashed'} ${HAIRLINE}`,
                background: PANEL, cursor: 'pointer', padding: bannerUrl ? '8px' : '26px',
                textAlign: 'center', transition: 'all 0.2s',
              }}
            >
              {bannerUrl ? (
                <>
                  <img
                    src={bannerUrl}
                    alt="Tablecloth banner"
                    style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', display: 'block' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveBanner(); }}
                    title="Remove banner"
                    style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: 'rgba(0,0,0,0.75)', color: TEXT, border: `1px solid ${HAIRLINE}`,
                      borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
                      fontSize: '11px', lineHeight: '20px', textAlign: 'center', padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: SERIF, fontSize: '13.5px' }}>Add a banner image</div>
                  <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '6px' }}>Click to browse</div>
                </>
              )}
              <input
                id="home-banner-input"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type.startsWith('image/')) onSetBanner(file);
                  e.target.value = '';
                }}
              />
            </div>
          </Section>
        </div>

        <footer style={{ textAlign: 'center', marginTop: '10px' }}>
          <div style={{ marginBottom: '14px' }}>
            <Ornament width={40} />
          </div>
          <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.2em', color: MUTED }}>
            {sandbox || !authConfigured
              ? 'EVERYTHING LIVES IN YOUR BROWSER · NO ACCOUNT REQUIRED'
              : 'SYNCED TO YOUR ACCOUNT'}
          </p>
          {!sandbox && authConfigured && (
            <p style={{ margin: '12px 0 0', fontSize: '12px', fontFamily: SERIF, fontStyle: 'italic', color: MUTED }}>
              Prefer to keep things offline?{' '}
              <Link href="/sandbox" style={{ color: GOLD }}>
                Open the local sandbox →
              </Link>
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
