import type { SavedPlanRecord, VendorShowEntry } from './db';

// "Shows attended" is derived live, never stored: manual entries on the
// vendor plus saved plans where the vendor is assigned to at least one rect
// and the plan's show date is in the past. Unassigning a vendor or moving a
// show date self-corrects with nothing to keep in sync.

export interface ShowAttended {
  id: string;
  name: string;
  /** ISO yyyy-mm-dd */
  date: string;
  source: 'manual' | 'plan';
  planId?: string;
}

/** Local date as ISO yyyy-mm-dd (string compare works for ISO dates). */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function deriveShowsAttended(
  vendorId: string,
  manualShows: VendorShowEntry[],
  savedPlans: SavedPlanRecord[],
  today: string = todayISO(),
): ShowAttended[] {
  const shows: ShowAttended[] = manualShows.map((s) => ({
    id: s.id,
    name: s.name,
    date: s.date,
    source: 'manual' as const,
  }));

  for (const plan of savedPlans) {
    if (!plan.showDate || plan.showDate >= today) continue;
    try {
      const meta = JSON.parse(plan.metaJson) as { rects?: { vendorId?: string }[] };
      if (meta.rects?.some((r) => r.vendorId === vendorId)) {
        shows.push({
          id: `plan:${plan.id}`,
          name: plan.name,
          date: plan.showDate,
          source: 'plan',
          planId: plan.id,
        });
      }
    } catch {
      // corrupt meta — skip
    }
  }

  return shows.sort((a, b) => b.date.localeCompare(a.date));
}
