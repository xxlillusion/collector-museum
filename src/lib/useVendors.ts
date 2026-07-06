import { useState, useEffect, useCallback } from 'react';
import {
  createVendor,
  getVendors,
  updateVendor,
  deleteVendorRecord,
  setVendorBannerBlob,
  removeVendorBannerBlob,
  countInventory,
} from './db';
import type { VendorRecord, VendorShowEntry } from './db';

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
  manualShows: VendorShowEntry[];
  createdAt: number;
  updatedAt: number;
}

function toSummary(r: VendorRecord, inventoryCount: number): VendorSummary {
  return {
    id: r.id,
    name: r.name,
    bannerUrl: r.bannerBlob ? URL.createObjectURL(r.bannerBlob) : null,
    inventoryCount,
    manualShows: r.manualShows,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function useVendors() {
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const records = await getVendors();
    const counts = await Promise.all(records.map((r) => countInventory(r.id)));
    setVendors((prev) => {
      prev.forEach((v) => { if (v.bannerUrl) URL.revokeObjectURL(v.bannerUrl); });
      return records.map((r, i) => toSummary(r, counts[i]));
    });
    setLoading(false);
  }, []);

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
    const record = await createVendor(name);
    await reload();
    return record.id;
  }, [reload]);

  const renameVendor = useCallback(async (id: string, name: string) => {
    await updateVendor(id, { name });
    await reload();
  }, [reload]);

  const deleteVendor = useCallback(async (id: string) => {
    await deleteVendorRecord(id);
    await reload();
  }, [reload]);

  const setVendorBanner = useCallback(async (id: string, file: File) => {
    await setVendorBannerBlob(id, file);
    await reload();
  }, [reload]);

  const removeVendorBanner = useCallback(async (id: string) => {
    await removeVendorBannerBlob(id);
    await reload();
  }, [reload]);

  const addManualShow = useCallback(async (id: string, name: string, date: string) => {
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return;
    const manualShows: VendorShowEntry[] = [
      ...vendor.manualShows,
      { id: crypto.randomUUID(), name, date },
    ];
    await updateVendor(id, { manualShows });
    await reload();
  }, [vendors, reload]);

  const removeManualShow = useCallback(async (id: string, showId: string) => {
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return;
    await updateVendor(id, {
      manualShows: vendor.manualShows.filter((s) => s.id !== showId),
    });
    await reload();
  }, [vendors, reload]);

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
