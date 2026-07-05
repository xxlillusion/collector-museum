import { useState } from 'react';
import { useCards } from './lib/useCards';
import { useBanner } from './lib/useBanner';
import { useVendorPlan } from './lib/useVendorPlan';
import UploadScreen from './components/UploadScreen';
import Scene from './components/Scene';
import VendorSetupScreen from './components/VendorSetupScreen';
import VendorScene from './components/VendorScene';

type View = 'upload' | 'gallery' | 'vendorSetup' | 'vendorWalk';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const { cards, loading, addCard, removeCard } = useCards();
  const { bannerUrl, setBanner, removeBanner } = useBanner();
  const vendorPlan = useVendorPlan();

  if (view === 'gallery') {
    return (
      <Scene
        cards={cards}
        bannerUrl={bannerUrl}
        onManage={() => setView('upload')}
      />
    );
  }

  if (view === 'vendorSetup') {
    return (
      <VendorSetupScreen
        planUrl={vendorPlan.planUrl}
        planMeta={vendorPlan.planMeta}
        onSetPlan={vendorPlan.setPlan}
        onSaveMeta={vendorPlan.saveMeta}
        onClearPlan={vendorPlan.clearPlan}
        onGenerate={() => setView('vendorWalk')}
        onBack={() => setView('upload')}
      />
    );
  }

  if (view === 'vendorWalk' && vendorPlan.planMeta) {
    return (
      <VendorScene
        planMeta={vendorPlan.planMeta}
        bannerUrl={bannerUrl}
        onBack={() => setView('vendorSetup')}
      />
    );
  }

  return (
    <UploadScreen
      cards={cards}
      loading={loading}
      onAdd={addCard}
      onRemove={removeCard}
      bannerUrl={bannerUrl}
      onSetBanner={setBanner}
      onRemoveBanner={removeBanner}
      onEnter={() => setView('gallery')}
      onVendor={() => setView('vendorSetup')}
    />
  );
}
