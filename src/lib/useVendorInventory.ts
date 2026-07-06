import { useState, useEffect, useCallback } from 'react';
import {
  saveInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
} from './db';
import type { InventoryItemRecord } from './db';

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
    const records = await getInventoryItems(vendorId);
    setItems((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.imageUrl));
      return records.map((r) => ({ ...r, imageUrl: URL.createObjectURL(r.imageBlob) }));
    });
    setLoading(false);
  }, [vendorId]);

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
      if (file.type.startsWith('image/')) await saveInventoryItem(vendorId, file);
    }
    await reload();
  }, [vendorId, reload]);

  /** Persists and patches local state — no reload, so object URLs survive. */
  const setCaption = useCallback(async (id: string, caption: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, caption } : i)));
    await updateInventoryItem(id, { caption });
  }, []);

  const setVisible = useCallback(async (id: string, visible: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, visible } : i)));
    await updateInventoryItem(id, { visible });
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await deleteInventoryItem(id);
    await reload();
  }, [reload]);

  return { items, loading, reload, addItems, setCaption, setVisible, removeItem };
}
