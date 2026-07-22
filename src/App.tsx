import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './lib/auth';
import { useMyProfile } from './lib/useMyProfile';
import { useProvider, DataProviderBoundary } from './lib/provider/context';
import { localProvider } from './lib/provider/local';
import { useCards } from './lib/useCards';
import type { CardWithUrl } from './lib/useCards';
import { cardDetailsLine, hasCardMeta } from './lib/cardMeta';
import { orderForWalls } from './lib/wallOrder';
import { wallEligible, binderEligible } from './lib/displayPref';
import type { InspectSale } from './components/InspectOverlay';
import { useBanner } from './lib/useBanner';
import { useHallSignage } from './lib/useHallSignage';
import { resolveSignage } from './lib/hallSignage';
import { useVendorPlan } from './lib/useVendorPlan';
import { useVendorBanners } from './lib/useVendorBanners';
import { useSavedPlans } from './lib/useSavedPlans';
import { useVendors } from './lib/useVendors';
import { useVendorInventory } from './lib/useVendorInventory';
import HomeScreen from './components/HomeScreen';
import LandingScreen from './components/LandingScreen';
import VendorsScreen from './components/VendorsScreen';

// The three.js-heavy subtrees load on demand — the home screen and the
// platform pages (shows directory, auth, vendor profiles) must never pull
// the 3D bundle. Scene/VendorScene carry three/drei/postprocessing;
// VendorSetupScreen carries the detection pipeline + plan editor.
const Scene = lazy(() => import('./components/Scene'));
const VendorScene = lazy(() => import('./components/VendorScene'));
const VendorSetupScreen = lazy(() => import('./components/VendorSetupScreen'));

/** Black full-viewport fallback while a lazy chunk loads — the scenes' own
 *  LoadingOverlay takes over as soon as the module is in. */
function ChunkFallback() {
  return <div style={{ height: '100vh', background: '#000' }} />;
}

type View = 'home' | 'gallery' | 'vendorSetup' | 'vendorWalk' | 'vendors';

/** The view union is plain state, so DOM pages deep-link into it with
 *  `/?view=vendors` (sandbox / guest-only registry deep-links; signed-in
 *  accounts manage stores on /account?tab=stores instead and fall through
 *  to home). Read once at mount; the effect below strips the param so
 *  refresh/back land on home. */
function initialViewFromUrl(): View {
  return new URLSearchParams(window.location.search).get('view') === 'vendors'
    ? 'vendors'
    : 'home';
}

/**
 * Default route. Logged-out visitors on a configured deployment get the
 * landing page (published shows are public; the local experience lives at
 * /sandbox). Signed-in users — and guest-only deployments with no Supabase
 * env — get the full museum home. CTAs gate on the profile: Organizer Tools
 * for organizer-designated accounts. The local registry + show builder are
 * sandbox/guest-only surfaces — signed-in accounts use /account?tab=stores
 * and the organizer show editor instead.
 */
export default function App() {
  const { configured, session, loading } = useAuth();
  const { profile } = useMyProfile();

  if (configured && !session) {
    // Brief session-restore window: hold a blank museum background rather
    // than flashing the landing page at a user who is actually signed in.
    if (loading) return <div style={{ height: '100vh', background: '#171310' }} />;
    return <LandingScreen />;
  }

  return (
    <MuseumApp
      showRegistry={!configured}
      showOrganizer={Boolean(profile?.isOrganizer)}
    />
  );
}

/**
 * /sandbox — the no-account experience, everything in this browser's
 * IndexedDB regardless of who is signed in. Forcing the local provider (and
 * a fixed identity key) keeps a signed-in user's sandbox visit from touching
 * their cloud data — and keeps the sandbox intact across sign-ins.
 */
export function SandboxApp() {
  return (
    <DataProviderBoundary provider={localProvider} identity="sandbox">
      <MuseumApp sandbox />
    </DataProviderBoundary>
  );
}

function MuseumApp({
  sandbox = false,
  showRegistry = true,
  showOrganizer = false,
}: {
  sandbox?: boolean;
  showRegistry?: boolean;
  showOrganizer?: boolean;
}) {
  const [view, setView] = useState<View>(initialViewFromUrl);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('view')) return;
    params.delete('view');
    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    );
  }, []);
  const provider = useProvider();
  const { cards, loading, addCard, removeCard, updateCard } = useCards();
  const { bannerUrl, setBanner, removeBanner } = useBanner();
  const vendorPlan = useVendorPlan();
  const vendorBanners = useVendorBanners();
  const vendors = useVendors();

  // Which collection hangs in the museum: null = the user's own cards,
  // otherwise a vendor id whose inventory goes on the walls.
  const [galleryVendorId, setGalleryVendorId] = useState<string | null>(null);
  // "✎ add details" in the gallery overlay: jump home with this card's
  // metadata editor open (HomeScreen consumes it once, then clears it).
  const [autoEditCardId, setAutoEditCardId] = useState<string | null>(null);
  const galleryVendor = vendors.vendors.find((v) => v.id === galleryVendorId) ?? null;
  const galleryInventory = useVendorInventory(galleryVendor?.id ?? null);

  const galleryCards = useMemo<CardWithUrl[]>(() => {
    if (!galleryVendor) return cards;
    return galleryInventory.items.map((i) => ({
      id: i.id,
      name: i.caption,
      imageBlob: i.imageBlob,
      addedAt: i.addedAt,
      imageUrl: i.imageUrl,
      aspect: i.aspect,
      display: i.display,
      wallSlot: i.wallSlot,
    }));
  }, [galleryVendor, galleryInventory.items, cards]);

  // Wall/binder lists (F2 display flag + curation). Walls: curated order for
  // own cards, plain wall-eligible order for vendor inventory. Binder: every
  // binder-eligible item. Untouched data (no display set) passes through both
  // filters whole, reproducing the pre-wave behavior exactly.
  const ownWallCards = useMemo(() => orderForWalls(wallEligible(cards)), [cards]);
  const galleryWallCards = useMemo(
    () => (galleryVendor ? wallEligible(galleryCards) : ownWallCards),
    [galleryVendor, galleryCards, ownWallCards],
  );
  const galleryBinderCards = useMemo(() => binderEligible(galleryCards), [galleryCards]);

  // Captions under inspected works — vendor inventory captions, or the card's
  // name once the owner has filled in any placard metadata (unedited uploads
  // keep the pre-metadata behavior: no caption, filenames stay off the walls)
  const galleryCaptions = useMemo(() => {
    const map = new Map<string, string>();
    if (galleryVendor) {
      for (const i of galleryInventory.items) {
        if (i.caption) map.set(i.imageUrl, i.caption);
      }
    } else {
      for (const c of cards) {
        if (hasCardMeta(c)) map.set(c.imageUrl, c.name);
      }
    }
    return map;
  }, [galleryVendor, galleryInventory.items, cards]);

  // Placard details line — own cards only (set · number · year · grade)
  const galleryDetails = useMemo(() => {
    const map = new Map<string, string>();
    if (!galleryVendor) {
      for (const c of cards) {
        const line = cardDetailsLine(c);
        if (line) map.set(c.imageUrl, line);
      }
    }
    return map;
  }, [galleryVendor, cards]);

  // Sale placards (price / condition / sold) — likewise inventory-only
  const gallerySales = useMemo(() => {
    const map = new Map<string, InspectSale>();
    if (galleryVendor) {
      for (const i of galleryInventory.items) {
        map.set(i.imageUrl, { price: i.price, status: i.status, condition: i.condition });
      }
    }
    return map;
  }, [galleryVendor, galleryInventory.items]);

  // Hall signage working slots (F3) — belong to the current plan like the
  // legacy banner slots: replacing/clearing the plan clears the signage.
  const hallSignage = useHallSignage();
  const { clearAll: clearHallSignage, reload: reloadHallSignage } = hallSignage;

  // Legacy per-box banner slots belong to the current plan image — replacing
  // or clearing the plan drops them all
  const { setPlan, clearPlan } = vendorPlan;
  const { clearAll: clearVendorBanners, reload: reloadVendorBanners } = vendorBanners;
  const handleSetPlan = useCallback(async (file: File) => {
    await clearVendorBanners();
    await clearHallSignage();
    await setPlan(file);
  }, [clearVendorBanners, clearHallSignage, setPlan]);
  const handleClearPlan = useCallback(async () => {
    await clearVendorBanners();
    await clearHallSignage();
    await clearPlan();
  }, [clearVendorBanners, clearHallSignage, clearPlan]);

  // Saved plan snapshots; loading one replaces the working slots, so every
  // working-copy hook reloads afterwards
  const savedPlans = useSavedPlans();
  const { loadPlan } = savedPlans;
  const { reload: reloadVendorPlan } = vendorPlan;
  const handleLoadPlan = useCallback(async (id: string) => {
    await loadPlan(id);
    await Promise.all([reloadVendorPlan(), reloadVendorBanners(), reloadHallSignage()]);
  }, [loadPlan, reloadVendorPlan, reloadVendorBanners, reloadHallSignage]);

  // The sandbox hall's resolved signage (defaults unless the user configured
  // any of it in the setup screen). No show name in the working slots — the
  // default title stays 'CARD SHOW' until a title is set.
  const sandboxSignage = useMemo(
    () =>
      resolveSignage(hallSignage.config, undefined, {
        header: hallSignage.headerUrl ?? undefined,
        banner: hallSignage.bannerUrl ?? undefined,
      }),
    [hallSignage.config, hallSignage.headerUrl, hallSignage.bannerUrl],
  );

  if (view === 'gallery') {
    return (
      <Suspense fallback={<ChunkFallback />}>
        <Scene
          cards={galleryCards}
          wallCards={galleryWallCards}
          binderCards={galleryBinderCards}
          captions={galleryCaptions}
          details={galleryDetails}
          sales={gallerySales}
          bannerUrl={bannerUrl}
          onManage={() => setView('home')}
          // In-3D wall arrangement (F1) — own cards persist via updateCard's
          // metadata jsonb; a selected local store persists per item.
          arrange={
            galleryVendor
              ? { onSetSlot: (id, slot) => galleryInventory.setWallSlot(id, slot) }
              : { onSetSlot: (id, slot) => updateCard(id, { wallSlot: slot ?? undefined }) }
          }
          // Own-cards walls only — vendor inventory has no card editor
          onAddDetails={
            galleryVendor
              ? undefined
              : (url) => {
                  const card = cards.find((c) => c.imageUrl === url);
                  if (!card) return;
                  setAutoEditCardId(card.id);
                  setView('home');
                }
          }
        />
      </Suspense>
    );
  }

  // Signed-in configured accounts have no registry view — a stale
  // `/?view=vendors` deep-link falls through to the home screen (the mount
  // effect above already stripped the param).
  if (view === 'vendors' && showRegistry) {
    return (
      <VendorsScreen
        vendors={vendors.vendors}
        savedPlans={savedPlans.savedPlans}
        onAddVendor={vendors.addVendor}
        onRenameVendor={vendors.renameVendor}
        onDeleteVendor={vendors.deleteVendor}
        onSetVendorBanner={vendors.setVendorBanner}
        onRemoveVendorBanner={vendors.removeVendorBanner}
        onAddManualShow={vendors.addManualShow}
        onRemoveManualShow={vendors.removeManualShow}
        onInventoryChanged={vendors.reload}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'vendorSetup') {
    return (
      <Suspense fallback={<ChunkFallback />}>
      <VendorSetupScreen
        planUrl={vendorPlan.planUrl}
        planMeta={vendorPlan.planMeta}
        getPlanBlob={vendorPlan.getPlanBlob}
        onSetPlan={handleSetPlan}
        onSaveMeta={vendorPlan.saveMeta}
        onClearPlan={handleClearPlan}
        vendors={vendors.vendors}
        onAddVendor={vendors.addVendor}
        savedPlans={savedPlans.savedPlans}
        onSavePlan={savedPlans.saveCurrentPlan}
        onLoadPlan={handleLoadPlan}
        onDeletePlan={savedPlans.deletePlan}
        onGenerate={async () => {
          // The setup screen edits the signage slots through its own hook
          // instance — refresh ours so the walk renders what was just saved.
          await reloadHallSignage();
          setView('vendorWalk');
        }}
        onBack={() => setView('home')}
      />
      </Suspense>
    );
  }

  if (view === 'vendorWalk' && vendorPlan.planMeta) {
    return (
      <Suspense fallback={<ChunkFallback />}>
        <VendorScene
          planMeta={vendorPlan.planMeta}
          planUrl={vendorPlan.planUrl}
          bannerUrl={bannerUrl}
          vendorBannerUrls={vendorBanners.bannerUrls}
          vendors={vendors.vendors}
          signage={sandboxSignage}
          fetchInventory={provider.getInventoryItems}
          onBack={() => setView('vendorSetup')}
        />
      </Suspense>
    );
  }

  return (
    <HomeScreen
      cards={cards}
      loading={loading}
      onAdd={addCard}
      onRemove={removeCard}
      onUpdateCard={updateCard}
      autoEditCardId={autoEditCardId ?? undefined}
      onAutoEditConsumed={() => setAutoEditCardId(null)}
      bannerUrl={bannerUrl}
      onSetBanner={setBanner}
      onRemoveBanner={removeBanner}
      savedPlans={savedPlans.savedPlans}
      vendors={vendors.vendors}
      galleryVendorId={galleryVendor?.id ?? null}
      onSelectGalleryVendor={setGalleryVendorId}
      onWalkPlan={async (id) => {
        await handleLoadPlan(id);
        setView('vendorWalk');
      }}
      onEnter={() => setView('gallery')}
      onVendor={() => setView('vendorSetup')}
      onVendors={() => setView('vendors')}
      sandbox={sandbox}
      showRegistry={showRegistry}
      showOrganizer={showOrganizer}
    />
  );
}
