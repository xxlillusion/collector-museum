import { useState, useEffect, useCallback } from 'react';
import { saveBanner, getBanner, deleteBanner } from './db';

/**
 * Tablecloth banner image (single slot, IndexedDB `settings` store).
 * Kept separate from useCards so banner changes don't re-render the
 * card layout.
 */
export function useBanner() {
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const loadBanner = useCallback(async () => {
    const blob = await getBanner();
    setBannerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }, []);

  useEffect(() => {
    loadBanner();
    return () => {
      setBannerUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
    };
  }, [loadBanner]);

  const setBanner = useCallback(async (file: File) => {
    await saveBanner(file);
    await loadBanner();
  }, [loadBanner]);

  const removeBanner = useCallback(async () => {
    await deleteBanner();
    await loadBanner();
  }, [loadBanner]);

  return { bannerUrl, setBanner, removeBanner };
}
