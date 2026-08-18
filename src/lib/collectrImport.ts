// Collectr collection import — pure codecs + reconciler, no React/IDB/DOM.
//
// Collectr (app.getcollectr.com) has no public portfolio API: a user's holdings
// sit behind auth, and only Collectr PRO offers a built-in export. So the app
// never talks to Collectr at all. Instead `tools/collectr-export/` (a local
// Playwright script the user runs on their own machine, against their own
// account) writes an export FOLDER, and the app reads it:
//
//   collectr-export/
//     collection.json   ← the envelope validated here
//     img/<id>.<ext>    ← one file per card, handed to provider.saveCard()
//
// Images are sidecar files rather than base64-in-JSON (the planFile.ts choice)
// because 500 cards of base64 is a ~130 MB string: JSON.parse stalls the tab,
// and sidecars arrive from the file picker as real `File`s that go straight
// into saveCard() with no decoding.
//
// This module is deliberately Node-runnable and side-effect free, in the
// bulkInventory.ts tradition: the preview table renders the very same plan
// object that APPLY consumes, so the preview cannot lie.

import type { CardPatch, CardRecord } from './db';

export const COLLECTR_FILE_FORMAT = 'vendor-museum-collectr';
export const COLLECTR_FILE_VERSION = 1;
/** Metadata only — images live beside the JSON. 500 items is ~150 KB. */
export const COLLECTR_FILE_MAX_BYTES = 4 * 1024 * 1024;

/** One holding, after normalization. `collectrId` is the re-import sync key. */
export interface CollectrItem {
  collectrId: string;
  name: string;
  setName?: string;
  cardNumber?: string;
  year?: string;
  /** "PSA 9" — set only for graded copies. */
  grade?: string;
  /** "NM" — raw condition; Collectr reports one or the other, not both. */
  condition?: string;
  /** Copies owned; always ≥ 1. 1 means "don't render a count". */
  quantity: number;
  /** Folder-relative path, e.g. "img/prod_88213.png". Absent = no image found. */
  image?: string;
  imageSource?: 'collectr' | 'pokemontcg' | 'none';
}

export interface CollectrEnvelope {
  format: typeof COLLECTR_FILE_FORMAT;
  version: number;
  source: 'collectr-script' | 'collectr-csv';
  exportedAt: string;
  items: CollectrItem[];
}

/** A parsed envelope plus what we quietly dropped, so the UI can say so. */
export interface ParsedCollectr {
  items: CollectrItem[];
  exportedAt?: string;
  source: string;
  /** Items rejected by validation — reported, never fatal. */
  droppedCount: number;
}

export type ParseCollectrResult = ParsedCollectr | { error: string };

const NOT_A_COLLECTR_FILE = 'Not a Vendor Museum Collectr export.';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** One raw entry → CollectrItem, or null if it can't be trusted. */
function normalizeItem(raw: unknown): CollectrItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const collectrId = str(o.collectrId);
  const name = str(o.name);
  // Without a sync key we could never reconcile it; without a name the museum
  // placard is blank. Both are load-bearing, so both are required.
  if (!collectrId || !name) return null;

  let quantity = 1;
  if (isFiniteNumber(o.quantity) && o.quantity >= 1) quantity = Math.floor(o.quantity);

  const item: CollectrItem = { collectrId, name, quantity };
  const setName = str(o.setName);
  if (setName) item.setName = setName;
  const cardNumber = str(o.cardNumber);
  if (cardNumber) item.cardNumber = cardNumber;
  const year = str(o.year);
  if (year) item.year = year;
  const grade = str(o.grade);
  if (grade) item.grade = grade;
  const condition = str(o.condition);
  if (condition) item.condition = condition;
  const image = str(o.image);
  if (image) item.image = image;
  const src = str(o.imageSource);
  if (src === 'collectr' || src === 'pokemontcg' || src === 'none') item.imageSource = src;
  return item;
}

/**
 * Parse + validate `collection.json`. Returns `{ error }` with a human-readable
 * message rather than throwing, matching parsePlanFile.
 *
 * Takes a string, not a Blob, so this stays trivially callable from Node.
 */
export function parseCollectrEnvelope(text: string): ParseCollectrResult {
  if (text.length > COLLECTR_FILE_MAX_BYTES) {
    return { error: 'That collection.json is too large (over 4 MB).' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: NOT_A_COLLECTR_FILE };
  }
  if (typeof raw !== 'object' || raw === null) return { error: NOT_A_COLLECTR_FILE };
  const doc = raw as Record<string, unknown>;

  if (doc.format !== COLLECTR_FILE_FORMAT || !isFiniteNumber(doc.version)) {
    return { error: NOT_A_COLLECTR_FILE };
  }
  if (doc.version > COLLECTR_FILE_VERSION) {
    return { error: 'This export was made by a newer version of Vendor Museum.' };
  }
  if (!Array.isArray(doc.items)) {
    return { error: 'The export is damaged (missing items).' };
  }

  const items: CollectrItem[] = [];
  const seen = new Set<string>();
  let droppedCount = 0;
  for (const raw of doc.items) {
    const item = normalizeItem(raw);
    if (!item) {
      droppedCount++;
      continue;
    }
    // A duplicate key means the exporter's grouping was wrong. Applying it
    // blind would double-create the same card on every single run, so this is
    // fatal rather than merged.
    if (seen.has(item.collectrId)) {
      return {
        error: `The export is damaged (two items share the id "${item.collectrId}").`,
      };
    }
    seen.add(item.collectrId);
    items.push(item);
  }

  return {
    items,
    exportedAt: str(doc.exportedAt),
    source: str(doc.source) ?? 'collectr-script',
    droppedCount,
  };
}

// ---------------------------------------------------------------------------
// Reconcile

/** The fields the reconciler reads — no Blob, so this stays pure. */
export type SyncCard = Pick<
  CardRecord,
  'id' | 'name' | 'setName' | 'cardNumber' | 'year' | 'grade' | 'condition' | 'quantity' | 'collectrId'
>;

export interface CollectrSyncPlan {
  adds: { item: CollectrItem; patch: CardPatch }[];
  updates: { id: string; item: CollectrItem; patch: CardPatch; before: SyncCard }[];
  unchanged: CollectrItem[];
  /** New items with no image — CardRecord.imageBlob is required, so they can't
   *  become cards. Reported, not silently skipped. */
  blocked: { item: CollectrItem; reason: 'no-image' }[];
  /** Cards already in the museum this export doesn't mention. Never written. */
  untouchedCount: number;
}

/**
 * The fields the import owns. Everything NOT listed here — notably every
 * curation field (`featured`, `hangOrder`, `onWalls`, `display`, `wallSlot`)
 * plus the user's own `notes` — is never written on update. That is the whole
 * contract: re-importing must not rearrange a museum somebody hand-curated.
 */
const IMPORT_OWNED = ['name', 'setName', 'cardNumber', 'year', 'grade', 'condition'] as const;

/** Collectr's quantity 1 maps to `undefined` so the key clears rather than
 *  persisting a redundant 1 — matching how remote.ts omits it below 2. */
function quantityValue(item: CollectrItem): number | undefined {
  return item.quantity > 1 ? item.quantity : undefined;
}

/**
 * Diff an export against the existing collection, matched on `collectrId`.
 * Pure: same inputs, same plan, every time.
 */
export function planCollectrSync(
  existing: SyncCard[],
  items: CollectrItem[],
): CollectrSyncPlan {
  const byCollectrId = new Map<string, SyncCard>();
  for (const card of existing) {
    if (!card.collectrId) continue;
    // Keep the first (= oldest: both providers return cards ordered by addedAt
    // ascending), so a stray duplicate resolves deterministically.
    if (!byCollectrId.has(card.collectrId)) byCollectrId.set(card.collectrId, card);
  }

  const plan: CollectrSyncPlan = {
    adds: [],
    updates: [],
    unchanged: [],
    blocked: [],
    untouchedCount: 0,
  };
  const matched = new Set<string>();

  for (const item of items) {
    const current = byCollectrId.get(item.collectrId);

    if (!current) {
      if (!item.image) {
        plan.blocked.push({ item, reason: 'no-image' });
        continue;
      }
      const patch: CardPatch = { name: item.name, collectrId: item.collectrId };
      for (const k of IMPORT_OWNED) {
        if (k === 'name') continue;
        if (item[k]) patch[k] = item[k];
      }
      const qty = quantityValue(item);
      if (qty !== undefined) patch.quantity = qty;
      plan.adds.push({ item, patch });
      continue;
    }

    matched.add(current.id);

    // Only include keys whose value actually differs, so an untouched card
    // produces an empty patch and lands in `unchanged` with zero writes.
    const patch: CardPatch = {};
    for (const k of IMPORT_OWNED) {
      const next = item[k];
      const prev = current[k];
      if ((next ?? undefined) !== (prev ?? undefined)) {
        patch[k] = next;
      }
    }
    const nextQty = quantityValue(item);
    const prevQty = current.quantity && current.quantity > 1 ? current.quantity : undefined;
    if (nextQty !== prevQty) patch.quantity = nextQty;

    if (Object.keys(patch).length === 0) plan.unchanged.push(item);
    else plan.updates.push({ id: current.id, item, patch, before: current });
  }

  // Hand-added cards and cards dropped from Collectr both land here. Nothing is
  // ever deleted: Collectr is not the source of truth for the whole museum.
  plan.untouchedCount = existing.length - matched.size;
  return plan;
}
