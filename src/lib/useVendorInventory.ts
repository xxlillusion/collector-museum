import { useState, useEffect, useCallback } from 'react';
import type { InventoryItemRecord } from './db';
import { useProvider } from './provider/context';

export interface InventoryItemWithUrl extends InventoryItemRecord {
  imageUrl: string;
}

/**
 * One vendor's inventory with object URLs, loaded lazily — pass null to load
 * nothing. Used by the Vendors screen (editing), the museum gallery (selected
 * vendor's collection on the walls) and the hall (the open binder's vendor).
 * URLs are revoked on vendor switch and unmount.
 */
export function useVendorInventory(vendorId: string | null) {
  const provider = useProvider();
  const [items, setItems] = useState<InventoryItemWithUrl[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!vendorId) {
      setItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.imageUrl));
        return [];
      });
      return;
    }
    setLoading(true);
    const records = await provider.getInventoryItems(vendorId);
    setItems((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.imageUrl));
      return records.map((r) => ({ ...r, imageUrl: URL.createObjectURL(r.imageBlob) }));
    });
    setLoading(false);
  }, [provider, vendorId]);

  useEffect(() => {
    reload();
    return () => {
      setItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.imageUrl));
        return prev;
      });
    };
  }, [reload]);

  const addItems = useCallback(async (files: File[]) => {
    if (!vendorId) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) await provider.saveInventoryItem(vendorId, file);
    }
    await reload();
  }, [provider, vendorId, reload]);

  /** Persists and patches local state — no reload, so object URLs survive. */
  const setCaption = useCallback(async (id: string, caption: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, caption } : i)));
    await provider.updateInventoryItem(id, { caption });
  }, [provider]);

  const setVisible = useCallback(async (id: string, visible: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, visible } : i)));
    await provider.updateInventoryItem(id, { visible });
  }, [provider]);

  /** Sale metadata (price / status / condition) — same persist-and-patch shape. */
  const setSale = useCallback(async (
    id: string,
    patch: Partial<Pick<InventoryItemRecord, 'price' | 'status' | 'condition'>>,
  ) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await provider.updateInventoryItem(id, patch);
  }, [provider]);

  /**
   * Sequential bulk persist-and-patch (paste-from-spreadsheet tooling).
   * Empty patches are skipped; onProgress fires after each persisted update.
   * Side effects stay OUTSIDE the state updater — StrictMode double-invokes
   * updaters, which would double the provider writes.
   */
  const bulkUpdate = useCallback(async (
    updates: {
      id: string;
      patch: Partial<Pick<InventoryItemRecord, 'caption' | 'price' | 'condition' | 'status'>>;
    }[],
    onProgress?: (done: number, total: number) => void,
  ) => {
    const applicable = updates.filter((u) => Object.keys(u.patch).length > 0);
    let done = 0;
    for (const { id, patch } of applicable) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      await provider.updateInventoryItem(id, patch);
      done += 1;
      onProgress?.(done, applicable.length);
    }
  }, [provider]);

  const removeItem = useCallback(async (id: string) => {
    await provider.deleteInventoryItem(id);
    await reload();
  }, [provider, reload]);

  return { items, loading, reload, addItems, setCaption, setVisible, setSale, bulkUpdate, removeItem };
}
