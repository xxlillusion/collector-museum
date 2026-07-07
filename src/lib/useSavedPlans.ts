import { useState, useEffect, useCallback } from 'react';
// Legacy per-box banner slots are local-only forever (pre-vendor-entity
// plans) — they bypass the provider on purpose.
import { putVendorBanner, deleteAllVendorBanners } from './db';
import type { SavedPlanRecord } from './db';
import { useProvider } from './provider/context';

/**
 * Named saved plans (`plans` store): each record snapshots the working plan —
 * image + meta (rects reference vendors by id, resolved live against the
 * `vendors` store). Save copies working → snapshot; load copies snapshot →
 * working slots. The caller reloads useVendorPlan / useVendorBanners after
 * loadPlan. Legacy records may still bundle per-box banner blobs; loading
 * restores them so old plans keep rendering.
 */
export function useSavedPlans() {
  const provider = useProvider();
  const [savedPlans, setSavedPlans] = useState<SavedPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSavedPlans(await provider.getPlanRecords());
    setLoading(false);
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCurrentPlan = useCallback(async (name: string, showDate?: string) => {
    const [planBlob, metaBlob] = await Promise.all([
      provider.getFloorPlan(),
      provider.getPlanMetaBlob(),
    ]);
    if (!planBlob || !metaBlob) return;
    const metaJson = await metaBlob.text();
    const now = Date.now();
    const record: SavedPlanRecord = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      planBlob,
      metaJson,
      banners: [], // vendor banners live on VendorRecord now, resolved live
    };
    if (showDate) record.showDate = showDate;
    await provider.savePlanRecord(record);
    await refresh();
  }, [provider, refresh]);

  const loadPlan = useCallback(async (id: string) => {
    const record = savedPlans.find((p) => p.id === id);
    if (!record) return;
    await provider.putFloorPlanBlob(record.planBlob);
    await provider.savePlanMeta(JSON.parse(record.metaJson));
    await deleteAllVendorBanners();
    for (const b of record.banners) await putVendorBanner(b.id, b.blob);
  }, [provider, savedPlans]);

  const deletePlan = useCallback(async (id: string) => {
    await provider.deletePlanRecord(id);
    await refresh();
  }, [provider, refresh]);

  return { savedPlans, loading, saveCurrentPlan, loadPlan, deletePlan };
}
