import { useState, useEffect, useCallback } from 'react';
// Direct-db like the legacy vendorBanner slots: the signage working slots are
// sandbox drafting data, local by design (see db.ts). ShowEditorScreen keeps
// cloud signage in its own form state and never touches these.
import {
  saveHallSignageConfig,
  getHallSignageConfigBlob,
  saveHallSignageImage,
  getHallSignageImage,
  deleteHallSignageImage,
  deleteHallSignage,
  type HallSignageImageSlot,
} from './db';
import { parseSignage, type HallSignageConfig } from './hallSignage';

/**
 * Hall signage working slots (F3, sandbox) — useBanner-style hook over the
 * `hallSignage` settings slots: parsed config + object URLs for the two
 * optional uploaded images. Consumed by VendorSetupScreen (editor) and the
 * App sandbox walk (resolveSignage input). Cleared alongside the working
 * plan; saved plans snapshot/restore the slots via useSavedPlans.
 */
export function useHallSignage() {
  const [config, setConfig] = useState<HallSignageConfig | null>(null);
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [configBlob, headerBlob, bannerBlob] = await Promise.all([
      getHallSignageConfigBlob(),
      getHallSignageImage('header'),
      getHallSignageImage('banner'),
    ]);
    let parsed: HallSignageConfig | null = null;
    if (configBlob) {
      try {
        parsed = parseSignage(JSON.parse(await configBlob.text()));
      } catch {
        parsed = null; // corrupt slot renders as defaults, never crashes
      }
    }
    setConfig(parsed);
    setHeaderUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return headerBlob ? URL.createObjectURL(headerBlob) : null;
    });
    setBannerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return bannerBlob ? URL.createObjectURL(bannerBlob) : null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    return () => {
      setHeaderUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
      setBannerUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
    };
  }, [reload]);

  const saveConfig = useCallback(async (next: HallSignageConfig) => {
    await saveHallSignageConfig(next);
    await reload();
  }, [reload]);

  const setImage = useCallback(async (slot: HallSignageImageSlot, file: File) => {
    await saveHallSignageImage(slot, file);
    await reload();
  }, [reload]);

  const clearImage = useCallback(async (slot: HallSignageImageSlot) => {
    await deleteHallSignageImage(slot);
    await reload();
  }, [reload]);

  /** Clear config + both images (plan replace/clear). */
  const clearAll = useCallback(async () => {
    await deleteHallSignage();
    await reload();
  }, [reload]);

  return {
    config,
    headerUrl,
    bannerUrl,
    loading,
    reload,
    saveConfig,
    setImage,
    clearImage,
    clearAll,
  };
}
