import { useCallback, useState } from 'react';
import { deleteAllVendorBanners } from './lib/db';
import { useCards } from './lib/useCards';
import { useBanner } from './lib/useBanner';
import { useVendorPlan } from './lib/useVendorPlan';
import { useVendorBanners } from './lib/useVendorBanners';
import { useSavedPlans } from './lib/useSavedPlans';
import HomeScreen from './components/HomeScreen';
import Scene from './components/Scene';
import VendorSetupScreen from './components/VendorSetupScreen';
import VendorScene from './components/VendorScene';

type View = 'home' | 'gallery' | 'vendorSetup' | 'vendorWalk';

export default function App() {
  const [view, setView] = useState<View>('home');
  const { cards, loading, addCard, removeCard } = useCards();
  const { bannerUrl, setBanner, removeBanner } = useBanner();
  const vendorPlan = useVendorPlan();
  const vendorBanners = useVendorBanners();

  // Vendor banners belong to the current plan image — replacing or clearing
  // the plan drops them all
  const { setPlan, clearPlan } = vendorPlan;
  const { reload: reloadVendorBanners } = vendorBanners;
  const handleSetPlan = useCallback(async (file: File) => {
    await deleteAllVendorBanners();
    await setPlan(file);
    await reloadVendorBanners();
  }, [setPlan, reloadVendorBanners]);
  const handleClearPlan = useCallback(async () => {
    await deleteAllVendorBanners();
    await clearPlan();
    await reloadVendorBanners();
  }, [clearPlan, reloadVendorBanners]);

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
        cards={cards}
        bannerUrl={bannerUrl}
        onManage={() => setView('home')}
      />
    );
  }

  if (view === 'vendorSetup') {
    return (
      <VendorSetupScreen
        planUrl={vendorPlan.planUrl}
        planMeta={vendorPlan.planMeta}
        onSetPlan={handleSetPlan}
        onSaveMeta={vendorPlan.saveMeta}
        onClearPlan={handleClearPlan}
        vendorBannerUrls={vendorBanners.bannerUrls}
        onAddVendorBanner={vendorBanners.addVendorBanner}
        onRemoveVendorBanner={vendorBanners.removeVendorBanner}
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
      onWalkPlan={async (id) => {
        await handleLoadPlan(id);
        setView('vendorWalk');
      }}
      onEnter={() => setView('gallery')}
      onVendor={() => setView('vendorSetup')}
    />
  );
}
