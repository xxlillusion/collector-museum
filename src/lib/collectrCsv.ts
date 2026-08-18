// Collectr PRO CSV export → CollectrItem[]. Pure, Node-runnable.
//
// The secondary feeder: Collectr PRO includes a built-in collection export, so
// PRO users can skip tools/collectr-export/ entirely. It normalizes into the
// exact same CollectrItem shape as the Playwright script, so the app only ever
// learns one format.
//
// Unlike bulkInventory.ts's parseBulkLines (a deliberately simple per-line
// split for pasted spreadsheet rows), this is a real RFC-4180-ish parser: a
// vendor CSV will contain quoted fields with embedded commas ("Charizard, holo"),
// doubled quotes and embedded newlines. Getting that wrong silently shifts
// every column.
//
// CSV rows carry no image, so brand-new cards from a CSV land in the sync
// plan's `blocked` bucket (CardRecord.imageBlob is required). Rows matching
// cards already in the museum still sync quantity/condition/grade normally,
// which is what makes this path useful as a refresh.

import type { CollectrItem } from './collectrImport';

/** Split CSV text into rows of fields. Handles "" escapes and embedded \n. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Strip a UTF-8 BOM — Excel writes one and it would poison the first header.
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  row.push(field);
  rows.push(row);
  // Drop trailing blank rows (a file ending in a newline yields one).
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Header aliases, so Collectr renaming a column doesn't break the import. */
const ALIASES: Record<string, string[]> = {
  collectrId: ['collectrid', 'productid', 'product id', 'id', 'itemid', 'item id'],
  name: ['cardname', 'card name', 'name', 'product', 'productname', 'product name', 'title'],
  setName: ['setname', 'set name', 'set', 'expansion', 'series'],
  cardNumber: ['cardnumber', 'card number', 'number', 'collectornumber', 'collector number', 'card #', '#'],
  year: ['year', 'releaseyear', 'release year'],
  grade: ['grade', 'gradelabel', 'grade label'],
  gradingCompany: ['gradingcompany', 'grading company', 'grader'],
  condition: ['condition', 'conditionname', 'condition name'],
  quantity: ['quantity', 'qty', 'count', 'copies', 'amount'],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** header row → { field: columnIndex } */
function mapHeaders(header: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((raw, i) => {
    const h = norm(raw);
    const compact = h.replace(/\s+/g, '');
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (field in out) continue;
      if (aliases.includes(h) || aliases.includes(compact)) out[field] = i;
    }
  });
  return out;
}

export type ParseCsvResult =
  | { items: CollectrItem[]; droppedCount: number }
  | { error: string };

/**
 * Parse a Collectr PRO CSV export. Rows without a usable name are dropped and
 * counted rather than failing the whole file.
 */
export function parseCollectrCsv(text: string): ParseCsvResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { error: 'That CSV looks empty.' };

  const cols = mapHeaders(rows[0]);
  if (cols.name === undefined) {
    return { error: 'That CSV has no recognisable card-name column.' };
  }

  const at = (row: string[], field: string): string | undefined => {
    const i = cols[field];
    if (i === undefined) return undefined;
    const v = row[i]?.trim();
    return v ? v : undefined;
  };

  const items: CollectrItem[] = [];
  const seen = new Map<string, CollectrItem>();
  let droppedCount = 0;

  for (const row of rows.slice(1)) {
    const name = at(row, 'name');
    if (!name) { droppedCount++; continue; }

    // A graded slab is a distinct work on the wall from a raw copy, so the
    // grade is part of the identity, not just a field.
    const company = at(row, 'gradingCompany');
    const rawGrade = at(row, 'grade');
    const grade = rawGrade
      ? (company && !rawGrade.toLowerCase().startsWith(company.toLowerCase())
          ? `${company} ${rawGrade}`
          : rawGrade)
      : undefined;

    const setName = at(row, 'setName');
    const cardNumber = at(row, 'cardNumber');
    // Prefer Collectr's own id; fall back to a composite so the file still
    // round-trips (weaker: a set rename breaks the match).
    const baseId = at(row, 'collectrId')
      ?? `csv:${norm(name)}|${norm(setName ?? '')}|${norm(cardNumber ?? '')}`;
    // Grade is part of the identity ONLY when graded — a PSA 9 and a raw copy
    // of the same card are different works on a wall. Appending an empty
    // suffix to raw cards would make "p1|" here and "p1" from the export
    // script, so the two feeders could never match the same holding.
    const collectrId = grade ? `${baseId}|${grade}` : baseId;

    const qtyRaw = at(row, 'quantity');
    const qtyNum = qtyRaw ? Number(qtyRaw.replace(/[,\s]/g, '')) : 1;
    const quantity = Number.isFinite(qtyNum) && qtyNum >= 1 ? Math.floor(qtyNum) : 1;

    const existing = seen.get(collectrId);
    if (existing) {
      // Same card listed on several rows — sum the copies rather than erroring.
      existing.quantity += quantity;
      continue;
    }

    const item: CollectrItem = { collectrId, name, quantity, imageSource: 'none' };
    if (setName) item.setName = setName;
    if (cardNumber) item.cardNumber = cardNumber;
    const year = at(row, 'year');
    if (year) item.year = year;
    if (grade) item.grade = grade;
    else {
      const condition = at(row, 'condition');
      if (condition) item.condition = condition;
    }
    seen.set(collectrId, item);
    items.push(item);
  }

  if (items.length === 0) return { error: 'No usable rows found in that CSV.' };
  return { items, droppedCount };
}
