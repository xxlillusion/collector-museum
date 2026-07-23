import { useState, useEffect, useCallback } from 'react';
import type { VendorRecord, VendorShowEntry } from './db';
import type { BoothLayoutConfig } from './boothLayout';
import { useProvider } from './provider/context';

/**
 * Vendor list with lightweight summaries: banner object URLs and inventory
 * counts, never inventory blobs (those load lazily per vendor via
 * useVendorInventory). Same blob↔URL lifecycle as useCards/useBanner.
 */
export interface VendorSummary {
  id: string;
  name: string;
  bannerUrl: string | null;
  inventoryCount: number;
  /** Binder-eligible count (display ≠ 'walls') — drives hall binder poses;
   *  absent (pre-0008 cloud) falls back to inventoryCount. */
  binderCount?: number;
  /** Per-store booth layout default (F4); absent = defaults. */
  boothLayout?: BoothLayoutConfig;
  manualShows: VendorShowEntry[];
  createdAt: number;
  updatedAt: number;
}

function toSummary(
  r: VendorRecord,
  inventoryCount: number,
  binderCount: number,
): VendorSummary {
  return {
    id: r.id,
    name: r.name,
    bannerUrl: r.bannerBlob ? URL.createObjectURL(r.bannerBlob) : null,
    inventoryCount,
    binderCount,
    boothLayout: r.boothLayout,
    manualShows: r.manualShows,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function useVendors() {
  const provider = useProvider();
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const records = await provider.getVendors();
    const [counts, binderCounts] = await Promise.all([
      Promise.all(records.map((r) => provider.countInventory(r.id))),
      Promise.all(records.map((r) => provider.countBinderInventory(r.id))),
    ]);
    setVendors((prev) => {
      prev.forEach((v) => { if (v.bannerUrl) URL.revokeObjectURL(v.bannerUrl); });
      return records.map((r, i) => toSummary(r, counts[i], binderCounts[i]));
    });
    setLoading(false);
  }, [provider]);

  useEffect(() => {
    reload();
    return () => {
      setVendors((prev) => {
        prev.forEach((v) => { if (v.bannerUrl) URL.revokeObjectURL(v.bannerUrl); });
        return prev;
      });
    };
  }, [reload]);

  const addVendor = useCallback(async (name: string): Promise<string> => {
    const record = await provider.createVendor(name);
    await reload();
    return record.id;
  }, [provider, reload]);

  const renameVendor = useCallback(async (id: string, name: string) => {
    await provider.updateVendor(id, { name });
    await reload();
  }, [provider, reload]);

  const deleteVendor = useCallback(async (id: string) => {
    await provider.deleteVendorRecord(id);
    await reload();
  }, [provider, reload]);

  const setVendorBanner = useCallback(async (id: string, file: File) => {
    await provider.setVendorBannerBlob(id, file);
    await reload();
  }, [provider, reload]);

  const removeVendorBanner = useCallback(async (id: string) => {
    await provider.removeVendorBannerBlob(id);
    await reload();
  }, [provider, reload]);

  const addManualShow = useCallback(async (id: string, name: string, date: string) => {
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return;
    const manualShows: VendorShowEntry[] = [
      ...vendor.manualShows,
      { id: crypto.randomUUID(), name, date },
    ];
    await provider.updateVendor(id, { manualShows });
    await reload();
  }, [provider, vendors, reload]);

  const removeManualShow = useCallback(async (id: string, showId: string) => {
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return;
    await provider.updateVendor(id, {
      manualShows: vendor.manualShows.filter((s) => s.id !== showId),
    });
    await reload();
  }, [provider, vendors, reload]);

  return {
    vendors,
    loading,
    reload,
    addVendor,
    renameVendor,
    deleteVendor,
    setVendorBanner,
    removeVendorBanner,
    addManualShow,
    removeManualShow,
  };
}
