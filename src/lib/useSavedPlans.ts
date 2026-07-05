import { useState, useEffect, useCallback } from 'react';
import {
  savePlanRecord,
  getPlanRecords,
  deletePlanRecord,
  getFloorPlan,
  getPlanMetaBlob,
  putFloorPlanBlob,
  savePlanMeta,
  getVendorBanners,
  putVendorBanner,
  deleteAllVendorBanners,
} from './db';
import type { SavedPlanRecord } from './db';
import type { VendorPlanMeta } from './vendorPlan';

/**
 * Named saved plans (`plans` store): each record is a self-contained snapshot
 * of the working plan — image, meta, and the vendor banners it references.
 * Save copies working → snapshot; load copies snapshot → working slots.
 * The caller reloads useVendorPlan / useVendorBanners after loadPlan.
 */
export function useSavedPlans() {
  const [savedPlans, setSavedPlans] = useState<SavedPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSavedPlans(await getPlanRecords());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCurrentPlan = useCallback(async (name: string) => {
    const [planBlob, metaBlob, allBanners] = await Promise.all([
      getFloorPlan(),
      getPlanMetaBlob(),
      getVendorBanners(),
    ]);
    if (!planBlob || !metaBlob) return;
    const metaJson = await metaBlob.text();
    const meta = JSON.parse(metaJson) as VendorPlanMeta;
    const referenced = new Set(meta.rects.map((r) => r.bannerId).filter(Boolean));
    const banners = [...allBanners]
      .filter(([id]) => referenced.has(id))
      .map(([id, blob]) => ({ id, blob }));
    const now = Date.now();
    await savePlanRecord({
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      planBlob,
      metaJson,
      banners,
    });
    await refresh();
  }, [refresh]);

  const loadPlan = useCallback(async (id: string) => {
    const record = savedPlans.find((p) => p.id === id);
    if (!record) return;
    await putFloorPlanBlob(record.planBlob);
    await savePlanMeta(JSON.parse(record.metaJson));
    await deleteAllVendorBanners();
    for (const b of record.banners) await putVendorBanner(b.id, b.blob);
  }, [savedPlans]);

  const deletePlan = useCallback(async (id: string) => {
    await deletePlanRecord(id);
    await refresh();
  }, [refresh]);

  return { savedPlans, loading, saveCurrentPlan, loadPlan, deletePlan };
}
