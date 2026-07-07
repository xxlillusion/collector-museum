import { useState, useEffect, useCallback } from 'react';
import { useProvider } from './provider/context';

/**
 * Tablecloth banner image (single slot, IndexedDB `settings` store).
 * Kept separate from useCards so banner changes don't re-render the
 * card layout.
 */
export function useBanner() {
  const provider = useProvider();
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const loadBanner = useCallback(async () => {
    const blob = await provider.getBanner();
    setBannerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }, [provider]);

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
    await provider.saveBanner(file);
    await loadBanner();
  }, [provider, loadBanner]);

  const removeBanner = useCallback(async () => {
    await provider.deleteBanner();
    await loadBanner();
  }, [provider, loadBanner]);

  return { bannerUrl, setBanner, removeBanner };
}
