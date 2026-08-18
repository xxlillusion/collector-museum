// Browser-only glue between a picked folder and the pure parsers.
//
// Isolated here so collectrImport.ts / collectrCsv.ts stay free of File and
// FileList and remain runnable under plain Node.
//
// Two picker shapes must both work: a directory input (webkitRelativePath is
// populated, e.g. "collectr-export/img/a.png") and a plain multi-select where
// the user drags in the folder's contents (webkitRelativePath is ''). So image
// lookup tries the relative path first and falls back to basename.

import { parseCollectrEnvelope, type CollectrItem, type ParsedCollectr } from './collectrImport';
import { parseCollectrCsv } from './collectrCsv';

export interface CollectrFolderRead {
  items: CollectrItem[];
  exportedAt?: string;
  source: string;
  droppedCount: number;
  /** Lookup used by the apply step: envelope `image` path → picked File. */
  images: Map<string, File>;
}

export type ReadCollectrFolderResult = CollectrFolderRead | { error: string };

const basename = (p: string) => p.split('/').pop() ?? p;

/** Strip the top-level export directory the picker prepends. */
function relPath(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!rel) return f.name;
  const parts = rel.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : rel;
}

export async function readCollectrFolder(
  fileList: FileList | File[],
): Promise<ReadCollectrFolderResult> {
  const files = Array.from(fileList);
  if (files.length === 0) return { error: 'No files selected.' };

  const images = new Map<string, File>();
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const rel = relPath(f);
    images.set(rel, f);
    // Also index by basename so the flat multi-select path resolves "img/a.png".
    if (!images.has(basename(rel))) images.set(basename(rel), f);
  }

  const json = files.find((f) => basename(relPath(f)).toLowerCase() === 'collection.json');
  if (json) {
    const parsed = parseCollectrEnvelope(await json.text());
    if ('error' in parsed) return parsed;
    return { ...(parsed as ParsedCollectr), images };
  }

  // No envelope — accept a lone Collectr PRO CSV export instead.
  const csv = files.find((f) => basename(relPath(f)).toLowerCase().endsWith('.csv'));
  if (csv) {
    const parsed = parseCollectrCsv(await csv.text());
    if ('error' in parsed) return parsed;
    return {
      items: parsed.items,
      source: 'collectr-csv',
      droppedCount: parsed.droppedCount,
      images,
    };
  }

  return {
    error:
      'No collection.json or .csv found. Pick the export folder made by the Collectr script, or a Collectr PRO CSV.',
  };
}

/** Resolve an item's image to a picked File, tolerating path/basename shapes. */
export function resolveImage(images: Map<string, File>, item: CollectrItem): File | undefined {
  if (!item.image) return undefined;
  return images.get(item.image) ?? images.get(basename(item.image));
}
