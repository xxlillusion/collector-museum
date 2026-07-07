import { useState, useEffect, useCallback } from 'react';
import { useProvider } from './provider/context';
import { parsePlanMeta } from './vendorPlan';
import type { VendorPlanMeta } from './vendorPlan';

/**
 * Convention View floor plan (single slot, IndexedDB `settings` store):
 * the plan image blob ↔ object URL, plus its rect/scale metadata.
 * Same shape as useBanner. This is the drafting surface — it stays
 * local-backed even for signed-in users (see provider/types.ts).
 */
export function useVendorPlan() {
  const provider = useProvider();
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [planMeta, setPlanMeta] = useState<VendorPlanMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [blob, metaBlob] = await Promise.all([
      provider.getFloorPlan(),
      provider.getPlanMetaBlob(),
    ]);
    setPlanUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setPlanMeta((await parsePlanMeta(metaBlob)) ?? null);
    setLoading(false);
  }, [provider]);

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
    await provider.saveFloorPlan(file);
    await provider.deletePlanMeta();
    await load();
  }, [provider, load]);

  const saveMeta = useCallback(async (meta: VendorPlanMeta) => {
    await provider.savePlanMeta(meta);
    setPlanMeta(meta);
  }, [provider]);

  const clearPlan = useCallback(async () => {
    await provider.deleteFloorPlan();
    await load();
  }, [provider, load]);

  /** Raw working-slot blob — detection input (re-detect reads the stored image). */
  const getPlanBlob = useCallback(() => provider.getFloorPlan(), [provider]);

  return { planUrl, planMeta, setPlan, saveMeta, clearPlan, getPlanBlob, loading, reload: load };
}
