import { useState, useEffect, useCallback } from 'react';
import { saveVendorBanner, getVendorBanners, deleteVendorBanner } from './db';

/**
 * Per-vendor banner images (settings slots `vendorBanner:<id>`), loaded as a
 * map of object URLs. Same blob↔URL lifecycle as useBanner, many slots.
 */
export function useVendorBanners() {
  const [bannerUrls, setBannerUrls] = useState<Map<string, string>>(new Map());

  const reload = useCallback(async () => {
    const blobs = await getVendorBanners();
    setBannerUrls((prev) => {
      for (const url of prev.values()) URL.revokeObjectURL(url);
      return new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
    });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      setBannerUrls((prev) => {
        for (const url of prev.values()) URL.revokeObjectURL(url);
        return prev;
      });
    };
  }, [reload]);

  const addVendorBanner = useCallback(async (file: File): Promise<string> => {
    const id = await saveVendorBanner(file);
    await reload();
    return id;
  }, [reload]);

  const removeVendorBanner = useCallback(async (id: string) => {
    await deleteVendorBanner(id);
    await reload();
  }, [reload]);

  return { bannerUrls, addVendorBanner, removeVendorBanner, reload };
}
