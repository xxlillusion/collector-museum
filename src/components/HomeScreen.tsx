import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../lib/auth';
import type { CardWithUrl } from '../lib/useCards';
import type { SavedPlanRecord } from '../lib/db';
import type { VendorSummary } from '../lib/useVendors';
import {
  GOLD, BG, PANEL, HAIRLINE, TEXT, MUTED, SERIF, SANS,
  Ornament, QuickAction, Section, museumHoverCss,
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

export default function HomeScreen({
  cards,
  loading,
  onAdd,
  onRemove,
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '20px' }}>
            {cards.map((card) => (
              <figure key={card.id} className="museum-lift" style={{ margin: 0, position: 'relative' }}>
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  style={{
                    width: '100%', aspectRatio: '2.5/3.5', objectFit: 'cover', display: 'block',
                    borderRadius: '2px', border: '3px solid #3a2f1e',
                    outline: `1px solid ${HAIRLINE}`, outlineOffset: '3px',
                    boxSizing: 'border-box',
                  }}
                />
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
                <figcaption style={{
                  marginTop: '10px', textAlign: 'center', fontFamily: SERIF, fontSize: '11.5px',
                  fontStyle: 'italic', color: MUTED,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {card.name}
                </figcaption>
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
