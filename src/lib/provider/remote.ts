import type { DataProvider } from './types';
import { localProvider } from './local';

function notImplemented(method: string): never {
  throw new Error(
    `Remote provider: ${method} not implemented yet (filled in by the accounts workstream)`,
  );
}

/**
 * Supabase-backed provider for signed-in users. Phase 0 ships this as a stub;
 * the accounts workstream fills in the data domains (cards, vendors,
 * inventory, plans) against Postgres + Storage, downloading images to blobs
 * so downstream consumers are backend-agnostic.
 *
 * The floor-plan working slot stays local-backed on purpose (drafting surface
 * — see types.ts); those delegations are final, not stubs.
 */
export function makeRemoteProvider(userId: string): DataProvider {
  void userId; // used by the real implementation to scope queries
  return {
    kind: 'remote',

    saveCard: () => notImplemented('saveCard'),
    getCards: () => notImplemented('getCards'),
    deleteCard: () => notImplemented('deleteCard'),

    saveBanner: () => notImplemented('saveBanner'),
    getBanner: () => notImplemented('getBanner'),
    deleteBanner: () => notImplemented('deleteBanner'),

    // Working slot: local by design, even when signed in.
    saveFloorPlan: localProvider.saveFloorPlan,
    putFloorPlanBlob: localProvider.putFloorPlanBlob,
    getFloorPlan: localProvider.getFloorPlan,
    deleteFloorPlan: localProvider.deleteFloorPlan,
    savePlanMeta: localProvider.savePlanMeta,
    getPlanMetaBlob: localProvider.getPlanMetaBlob,
    deletePlanMeta: localProvider.deletePlanMeta,

    savePlanRecord: () => notImplemented('savePlanRecord'),
    getPlanRecords: () => notImplemented('getPlanRecords'),
    deletePlanRecord: () => notImplemented('deletePlanRecord'),

    createVendor: () => notImplemented('createVendor'),
    getVendors: () => notImplemented('getVendors'),
    updateVendor: () => notImplemented('updateVendor'),
    setVendorBannerBlob: () => notImplemented('setVendorBannerBlob'),
    removeVendorBannerBlob: () => notImplemented('removeVendorBannerBlob'),
    deleteVendorRecord: () => notImplemented('deleteVendorRecord'),

    saveInventoryItem: () => notImplemented('saveInventoryItem'),
    getInventoryItems: () => notImplemented('getInventoryItems'),
    countInventory: () => notImplemented('countInventory'),
    updateInventoryItem: () => notImplemented('updateInventoryItem'),
    deleteInventoryItem: () => notImplemented('deleteInventoryItem'),
  };
}
