import type { InventoryStatus } from './db';

// Bulk inventory paste parsing — pure and deterministic so the preview table
// is exactly what APPLY writes. One line per inventory item (grid order);
// fields in order: caption, price, condition, status. A field left blank (or
// unparseable) is `undefined` = leave the item's current value untouched.

export interface BulkRow {
  caption?: string;
  price?: number;
  condition?: string;
  status?: InventoryStatus;
}

/**
 * Parse spreadsheet-style pasted text into per-line field patches.
 *
 * Delimiter precedence per line: tab if the line contains one (spreadsheet
 * paste), else `|`, else comma. Tab and pipe deliberately outrank comma so
 * captions may legitimately contain commas ("Charizard, holo") — a comma is
 * only treated as a delimiter when no stronger one is present.
 *
 * Extra fields beyond the four are ignored. A line whose fields all come out
 * undefined is still returned — it maps to an item but changes nothing.
 */
export function parseBulkLines(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine);
}

function parseLine(line: string): BulkRow {
  const delim = line.includes('\t') ? '\t' : line.includes('|') ? '|' : ',';
  const fields = line.split(delim).map((f) => f.trim());
  return {
    caption: fields[0] || undefined,
    price: parsePrice(fields[1]),
    condition: fields[2] || undefined,
    status: parseStatus(fields[3]),
  };
}

/** "$1,200" / "95.5" → number; empty, unparseable or negative → undefined. */
function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Case-insensitive status words → InventoryStatus; anything else undefined. */
function parseStatus(raw: string | undefined): InventoryStatus | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm === 'sold') return 'sold';
  if (norm === 'display' || norm === 'display only') return 'display';
  if (norm === 'forsale' || norm === 'for sale') return 'forSale';
  return undefined;
}
