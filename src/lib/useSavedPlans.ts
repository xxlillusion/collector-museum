import { useState, useEffect, useCallback } from 'react';
// Legacy per-box banner slots are local-only forever (pre-vendor-entity
// plans) — they bypass the provider on purpose.
import { putVendorBanner, deleteAllVendorBanners } from './db';
import type { SavedPlanRecord } from './db';
import { useProvider } from './provider/context';
import { exportPlanFile, parsePlanFile, planFileFilename } from './planFile';

// Cross-instance refresh bus: VendorSetupScreen mounts its own useSavedPlans
// for export/import (App's prop wiring is frozen), while App's instance feeds
// the rendered list. Any instance's mutation notifies every mounted instance
// so both stay in sync.
const refreshListeners = new Set<() => Promise<void> | void>();
async function notifyPlansChanged(): Promise<void> {
  await Promise.all([...refreshListeners].map((fn) => fn()));
}

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
    refreshListeners.add(refresh);
    return () => {
      refreshListeners.delete(refresh);
    };
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
    await notifyPlansChanged();
  }, [provider]);

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
    await notifyPlansChanged();
  }, [provider]);

  /**
   * Build a portable .vmplan.json file for a saved plan (image inlined as a
   * data URL). Returns null when the id doesn't resolve.
   */
  const exportPlan = useCallback(async (id: string): Promise<{ blob: Blob; filename: string } | null> => {
    // Read fresh through the provider so the export always reflects what's
    // actually persisted (incl. the image blob).
    const record = (await provider.getPlanRecords()).find((p) => p.id === id);
    if (!record) return null;
    const blob = await exportPlanFile({
      name: record.name,
      showDate: record.showDate,
      metaJson: record.metaJson,
      planBlob: record.planBlob,
    });
    return { blob, filename: planFileFilename(record.name) };
  }, [provider]);

  /**
   * Import a .vmplan.json file as a NEW saved plan (fresh id, `banners: []`
   * like current saves, name de-duped with " (2)", " (3)", …).
   *
   * ⚠ Sandbox/guest-only by design: this persists through the SAME provider
   * method as saveCurrentPlan, and in the signed-in context `savePlanRecord`
   * maps to `upsertCloudPlan` (creates a cloud show). The only host with
   * import UI is VendorSetupScreen, which is sandbox/guest-only, so imports
   * always hit the local provider. An organizer-side import is a possible
   * future follow-up (see planFile.ts).
   */
  const importPlanFile = useCallback(async (file: File): Promise<{ ok: true; name: string } | { ok: false; error: string }> => {
    const parsed = await parsePlanFile(file);
    if ('error' in parsed) return { ok: false, error: parsed.error };

    const existing = new Set((await provider.getPlanRecords()).map((p) => p.name));
    let name = parsed.name;
    for (let n = 2; existing.has(name); n++) name = `${parsed.name} (${n})`;

    const now = Date.now();
    const record: SavedPlanRecord = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      planBlob: parsed.planBlob,
      metaJson: JSON.stringify(parsed.meta),
      banners: [], // vendor banners live on VendorRecord, resolved live
    };
    if (parsed.showDate) record.showDate = parsed.showDate;
    await provider.savePlanRecord(record);
    await notifyPlansChanged();
    return { ok: true, name };
  }, [provider]);

  return { savedPlans, loading, saveCurrentPlan, loadPlan, deletePlan, exportPlan, importPlanFile };
}
