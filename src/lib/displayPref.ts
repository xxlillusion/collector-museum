/**
 * Per-item wall/binder display choice (F2). Pure helpers shared by the museum
 * (walls + binder lists), the hall binders and the registry UI.
 *
 * Semantics: 'both' is the default everywhere (absent = 'both'). Legacy cards
 * that were hidden via the 0007-era curation flag keep working:
 * `onWalls === false` reads as 'binder' unless an explicit `display` exists.
 * New UI writes `display` only — `onWalls` stays read-compatible.
 */

export type DisplayPref = 'walls' | 'binder' | 'both';

export const DISPLAY_PREFS: readonly DisplayPref[] = ['walls', 'binder', 'both'];

export function isDisplayPref(v: unknown): v is DisplayPref {
  return v === 'walls' || v === 'binder' || v === 'both';
}

interface Displayable {
  display?: DisplayPref;
  onWalls?: boolean;
}

/** Effective display choice with legacy `onWalls:false` → 'binder' fallback. */
export function effectiveDisplay(x: Displayable): DisplayPref {
  if (x.display && isDisplayPref(x.display)) return x.display;
  return x.onWalls === false ? 'binder' : 'both';
}

/** Items that hang on the museum walls (display ≠ 'binder'). */
export function wallEligible<T extends Displayable>(items: T[]): T[] {
  return items.filter((x) => effectiveDisplay(x) !== 'binder');
}

/** Items that page in binders — museum table binder and hall booth binders
 *  (display ≠ 'walls'). */
export function binderEligible<T extends Displayable>(items: T[]): T[] {
  return items.filter((x) => effectiveDisplay(x) !== 'walls');
}
