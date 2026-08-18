// Applies a Collectr sync plan through the provider seam. Structural mirror of
// importLocal.ts: sequential writes with an onProgress callback.
//
// This talks to the DataProvider DIRECTLY rather than going through
// useCards.addCard, deliberately. addCard calls loadCards() after every single
// save, and on the remote provider loadCards downloads every image in the
// collection (remote.ts). Five hundred adds that way is ~125,000 image
// downloads. Here the caller reloads exactly once, at the end.

import type { DataProvider } from './provider/types';
import type { CollectrItem, CollectrSyncPlan } from './collectrImport';
import { resolveImage } from './collectrFolder';

export interface CollectrApplyResult {
  added: number;
  updated: number;
  unchanged: number;
  /** New items with no usable image file. */
  skipped: number;
  /** "Charizard: <message>" — one per item that threw. */
  failures: string[];
}

const label = (item: CollectrItem) => item.name || item.collectrId;

/**
 * Updates first (cheap, metadata only), then adds (each uploads an image), so
 * an interrupted run still leaves the collection coherent.
 *
 * A single bad item must never cost the other 499: every step is individually
 * caught and recorded in `failures`.
 */
export async function applyCollectrSync(
  provider: DataProvider,
  plan: CollectrSyncPlan,
  images: Map<string, File>,
  onProgress: (message: string) => void,
): Promise<CollectrApplyResult> {
  const result: CollectrApplyResult = {
    added: 0,
    updated: 0,
    unchanged: plan.unchanged.length,
    skipped: plan.blocked.length,
    failures: [],
  };

  for (let i = 0; i < plan.updates.length; i++) {
    const { id, item, patch } = plan.updates[i];
    onProgress(`Updating ${i + 1} of ${plan.updates.length} — ${label(item)}…`);
    try {
      await provider.updateCard(id, patch);
      result.updated++;
    } catch (e) {
      result.failures.push(`${label(item)}: ${(e as Error).message}`);
    }
  }

  for (let i = 0; i < plan.adds.length; i++) {
    const { item, patch } = plan.adds[i];
    onProgress(`Adding card ${i + 1} of ${plan.adds.length} — ${label(item)}…`);
    const file = resolveImage(images, item);
    if (!file) {
      // The envelope named an image the folder doesn't contain.
      result.skipped++;
      result.failures.push(`${label(item)}: image file "${item.image}" was not in the folder.`);
      continue;
    }
    try {
      // Two writes: the frozen seam's saveCard takes a File and mints the id
      // (setting name from the filename), so the metadata patch follows. The
      // filename is visible for well under a second — nothing reloads until
      // the whole run finishes.
      const rec = await provider.saveCard(file);
      await provider.updateCard(rec.id, patch);
      result.added++;
    } catch (e) {
      result.failures.push(`${label(item)}: ${(e as Error).message}`);
    }
  }

  return result;
}
