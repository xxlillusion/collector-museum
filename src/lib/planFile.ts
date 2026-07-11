// Portable saved-plan files (.vmplan.json) — pure codecs, no React/IDB.
//
// A plan file is a single self-contained JSON document: the plan image rides
// inside as a base64 data URL, so one file moves a whole show between
// browsers/machines. Vendor assignments (`meta.rects[].vendorId`) are kept in
// the file on purpose: imported into another browser they dangle and render
// as unassigned — the app's existing documented behavior for deleted vendors.
//
// SCOPE: import/export is a SANDBOX-ONLY surface (VendorSetupScreen). In the
// signed-in context the provider's `savePlanRecord` maps to `upsertCloudPlan`
// and mints a cloud show — importing there would create stray shows. An
// organizer-side import is a possible future follow-up; it would need to go
// through an explicit publish step, not `savePlanRecord`.

import type { VendorPlanMeta } from './vendorPlan';

export const PLAN_FILE_FORMAT = 'vendor-museum-plan';
export const PLAN_FILE_VERSION = 1;
/** Reject anything bigger — working plan images are downscaled ≤1600px WebP,
 *  so a legitimate export is a few hundred KB. */
export const PLAN_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** The on-disk envelope (version 1). */
export interface PlanFileEnvelope {
  format: typeof PLAN_FILE_FORMAT;
  version: number;
  name: string;
  /** ISO yyyy-mm-dd; optional like SavedPlanRecord.showDate. */
  showDate?: string;
  /** ISO timestamp of the export (informational). */
  exportedAt: string;
  meta: VendorPlanMeta;
  /** data:image/...;base64,... — the saved plan image. */
  planImage: string;
}

/** What the exporter needs from a SavedPlanRecord. */
export interface PlanExportInput {
  name: string;
  showDate?: string;
  /** JSON.stringify(VendorPlanMeta) as stored on the record. */
  metaJson: string;
  planBlob: Blob;
}

/** A validated, decoded plan file ready to become a new SavedPlanRecord. */
export interface ParsedPlan {
  name: string;
  showDate?: string;
  meta: VendorPlanMeta;
  planBlob: Blob;
}

export type ParsePlanResult = ParsedPlan | { error: string };

// ---------------------------------------------------------------------------
// blob ⇄ data URL (arrayBuffer-based so this file also runs under plain Node
// for tests — no FileReader dependency)

async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // keep String.fromCharCode arg counts sane
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/webp'};base64,${btoa(binary)}`;
}

function dataURLToBlob(dataURL: string): Blob | null {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]*)$/.exec(dataURL);
  if (!m) return null;
  try {
    const binary = atob(m[2].replace(/\s+/g, ''));
    if (binary.length === 0) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export

/** Build a portable plan file (application/json Blob) from a saved record. */
export async function exportPlanFile(input: PlanExportInput): Promise<Blob> {
  const envelope: PlanFileEnvelope = {
    format: PLAN_FILE_FORMAT,
    version: PLAN_FILE_VERSION,
    name: input.name,
    ...(input.showDate ? { showDate: input.showDate } : {}),
    exportedAt: new Date().toISOString(),
    meta: JSON.parse(input.metaJson) as VendorPlanMeta,
    planImage: await blobToDataURL(input.planBlob),
  };
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

// ---------------------------------------------------------------------------
// Import (strict validation, human-readable errors)

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidRect(r: unknown): boolean {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    isFiniteNumber(o.x) && isFiniteNumber(o.y) &&
    isFiniteNumber(o.w) && isFiniteNumber(o.h)
  );
}

function isValidMeta(m: unknown): m is VendorPlanMeta {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return (
    isFiniteNumber(o.imgW) && o.imgW > 0 &&
    isFiniteNumber(o.imgH) && o.imgH > 0 &&
    isFiniteNumber(o.pxPerMeter) && o.pxPerMeter > 0 &&
    Array.isArray(o.rects) && o.rects.every(isValidRect)
  );
}

const NOT_A_PLAN_FILE = 'Not a Vendor Museum plan file.';

/**
 * Parse + validate a plan file. Returns `{ error }` with a human-readable
 * message instead of throwing — callers surface the string inline.
 */
export async function parsePlanFile(file: Blob): Promise<ParsePlanResult> {
  if (file.size > PLAN_FILE_MAX_BYTES) {
    return { error: 'That file is too large to be a Vendor Museum plan (over 10 MB).' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { error: NOT_A_PLAN_FILE };
  }
  if (typeof raw !== 'object' || raw === null) return { error: NOT_A_PLAN_FILE };
  const doc = raw as Record<string, unknown>;

  if (doc.format !== PLAN_FILE_FORMAT || !isFiniteNumber(doc.version)) {
    return { error: NOT_A_PLAN_FILE };
  }
  if (doc.version > PLAN_FILE_VERSION) {
    return { error: 'This plan file was made by a newer version of Vendor Museum.' };
  }
  if (typeof doc.name !== 'string' || doc.name.trim().length === 0) {
    return { error: 'The plan file is damaged (missing plan name).' };
  }
  if (!isValidMeta(doc.meta)) {
    return { error: 'The plan file is damaged (bad floor-plan data).' };
  }
  if (typeof doc.planImage !== 'string') {
    return { error: 'The plan file is damaged (missing plan image).' };
  }
  const planBlob = dataURLToBlob(doc.planImage);
  if (!planBlob) {
    return { error: 'The plan file is damaged (bad plan image data).' };
  }

  // Normalize the meta we hand back: required fields validated above; keep
  // optional extras (rotationDeg, vendorId, startPx, tableLengthFt, …) as-is.
  const meta = doc.meta as VendorPlanMeta;
  if (!isFiniteNumber(meta.updatedAt)) meta.updatedAt = Date.now();

  const result: ParsedPlan = { name: doc.name.trim(), meta, planBlob };
  if (typeof doc.showDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(doc.showDate)) {
    result.showDate = doc.showDate;
  }
  return result;
}

/** `<safe-name>.vmplan.json` download filename for a plan name. */
export function planFileFilename(name: string): string {
  const safe = name
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${safe || 'plan'}.vmplan.json`;
}
