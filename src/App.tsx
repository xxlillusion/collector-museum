import { useState } from 'react';
import { useCards } from './lib/useCards';
import { useBanner } from './lib/useBanner';
import UploadScreen from './components/UploadScreen';
import Scene from './components/Scene';

type View = 'upload' | 'gallery';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const { cards, loading, addCard, removeCard } = useCards();
  const { bannerUrl, setBanner, removeBanner } = useBanner();

  if (view === 'gallery') {
    return (
      <Scene
        cards={cards}
        bannerUrl={bannerUrl}
        onManage={() => setView('upload')}
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
    />
  );
}
