import { useCallback, useMemo, useState } from 'react';
import { useProvider } from './lib/provider/context';
import { useCards } from './lib/useCards';
import type { CardWithUrl } from './lib/useCards';
import { useBanner } from './lib/useBanner';
import { useVendorPlan } from './lib/useVendorPlan';
import { useVendorBanners } from './lib/useVendorBanners';
import { useSavedPlans } from './lib/useSavedPlans';
import { useVendors } from './lib/useVendors';
import { useVendorInventory } from './lib/useVendorInventory';
import HomeScreen from './components/HomeScreen';
import Scene from './components/Scene';
import VendorSetupScreen from './components/VendorSetupScreen';
import VendorScene from './components/VendorScene';
import VendorsScreen from './components/VendorsScreen';

type View = 'home' | 'gallery' | 'vendorSetup' | 'vendorWalk' | 'vendors';

export default function App() {
  const [view, setView] = useState<View>('home');
  const provider = useProvider();
  const { cards, loading, addCard, removeCard } = useCards();
  const { bannerUrl, setBanner, removeBanner } = useBanner();
  const vendorPlan = useVendorPlan();
  const vendorBanners = useVendorBanners();
  const vendors = useVendors();

  // Which collection hangs in the museum: null = the user's own cards,
  // otherwise a vendor id whose inventory goes on the walls.
  const [galleryVendorId, setGalleryVendorId] = useState<string | null>(null);
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
    }));
  }, [galleryVendor, galleryInventory.items, cards]);

  // Captions under inspected works — only vendor inventory carries them
  const galleryCaptions = useMemo(() => {
    const map = new Map<string, string>();
    if (galleryVendor) {
      for (const i of galleryInventory.items) {
        if (i.caption) map.set(i.imageUrl, i.caption);
      }
    }
    return map;
  }, [galleryVendor, galleryInventory.items]);

  // Legacy per-box banner slots belong to the current plan image — replacing
  // or clearing the plan drops them all
  const { setPlan, clearPlan } = vendorPlan;
  const { clearAll: clearVendorBanners, reload: reloadVendorBanners } = vendorBanners;
  const handleSetPlan = useCallback(async (file: File) => {
    await clearVendorBanners();
    await setPlan(file);
  }, [clearVendorBanners, setPlan]);
  const handleClearPlan = useCallback(async () => {
    await clearVendorBanners();
    await clearPlan();
  }, [clearVendorBanners, clearPlan]);

  // Saved plan snapshots; loading one replaces the working slots, so both
  // working-copy hooks reload afterwards
  const savedPlans = useSavedPlans();
  const { loadPlan } = savedPlans;
  const { reload: reloadVendorPlan } = vendorPlan;
  const handleLoadPlan = useCallback(async (id: string) => {
    await loadPlan(id);
    await Promise.all([reloadVendorPlan(), reloadVendorBanners()]);
  }, [loadPlan, reloadVendorPlan, reloadVendorBanners]);

  if (view === 'gallery') {
    return (
      <Scene
        cards={galleryCards}
        captions={galleryCaptions}
        bannerUrl={bannerUrl}
        onManage={() => setView('home')}
      />
    );
  }

  if (view === 'vendors') {
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
        onGenerate={() => setView('vendorWalk')}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'vendorWalk' && vendorPlan.planMeta) {
    return (
      <VendorScene
        planMeta={vendorPlan.planMeta}
        planUrl={vendorPlan.planUrl}
        bannerUrl={bannerUrl}
        vendorBannerUrls={vendorBanners.bannerUrls}
        vendors={vendors.vendors}
        fetchInventory={provider.getInventoryItems}
        onBack={() => setView('vendorSetup')}
      />
    );
  }

  return (
    <HomeScreen
      cards={cards}
      loading={loading}
      onAdd={addCard}
      onRemove={removeCard}
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
    />
  );
}
