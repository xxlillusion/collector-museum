import { useState, useEffect, useCallback } from 'react';
import {
  saveFloorPlan,
  getFloorPlan,
  deleteFloorPlan,
  savePlanMeta,
  getPlanMetaBlob,
  deletePlanMeta,
} from './db';
import { parsePlanMeta } from './vendorPlan';
import type { VendorPlanMeta } from './vendorPlan';

/**
 * Convention View floor plan (single slot, IndexedDB `settings` store):
 * the plan image blob ↔ object URL, plus its rect/scale metadata.
 * Same shape as useBanner.
 */
export function useVendorPlan() {
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [planMeta, setPlanMeta] = useState<VendorPlanMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [blob, metaBlob] = await Promise.all([getFloorPlan(), getPlanMetaBlob()]);
    setPlanUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setPlanMeta((await parsePlanMeta(metaBlob)) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return () => {
      setPlanUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
    };
  }, [load]);

  /** Store a new plan image; stale rects from the old image are cleared. */
  const setPlan = useCallback(async (file: File) => {
    await saveFloorPlan(file);
    await deletePlanMeta();
    await load();
  }, [load]);

  const saveMeta = useCallback(async (meta: VendorPlanMeta) => {
    await savePlanMeta(meta);
    setPlanMeta(meta);
  }, []);

  const clearPlan = useCallback(async () => {
    await deleteFloorPlan();
    await load();
  }, [load]);

  return { planUrl, planMeta, setPlan, saveMeta, clearPlan, loading, reload: load };
}
