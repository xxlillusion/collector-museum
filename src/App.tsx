import { useState } from 'react';
import { useCards } from './lib/useCards';
import UploadScreen from './components/UploadScreen';
import Scene from './components/Scene';

type View = 'upload' | 'gallery';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const { cards, loading, addCard, removeCard } = useCards();

  if (view === 'gallery') {
    return (
      <Scene
        cards={cards}
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
      onEnter={() => setView('gallery')}
    />
  );
}
