import { useState, useEffect, useCallback } from 'react';
import { type CardRecord, saveCard, getCards, deleteCard } from './db';

export interface CardWithUrl extends CardRecord {
  imageUrl: string;
  aspect: number; // width / height of the source image
}

export function useCards() {
  const [cards, setCards] = useState<CardWithUrl[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCards = useCallback(async () => {
    const records = await getCards();
    const withUrls = await Promise.all(
      records.map(async (r) => {
        let aspect = 2.5 / 3.5; // fall back to Pokemon card ratio
        try {
          const bmp = await createImageBitmap(r.imageBlob);
          aspect = bmp.width / bmp.height;
          bmp.close();
        } catch {
          // keep fallback aspect
        }
        return {
          ...r,
          imageUrl: URL.createObjectURL(r.imageBlob),
          aspect,
        };
      }),
    );
    setCards((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.imageUrl));
      return withUrls;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCards();
    return () => {
      setCards((prev) => {
        prev.forEach((c) => URL.revokeObjectURL(c.imageUrl));
        return prev;
      });
    };
  }, [loadCards]);

  const addCard = useCallback(async (file: File) => {
    await saveCard(file);
    await loadCards();
  }, [loadCards]);

  const removeCard = useCallback(async (id: string) => {
    await deleteCard(id);
    await loadCards();
  }, [loadCards]);

  return { cards, loading, addCard, removeCard };
}
