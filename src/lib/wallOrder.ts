// Wall-curation ordering (roadmap item 3), shared by the home gallery and the
// public collector museum. Pure so it's testable in isolation and generic so
// hosts with index-based addedAt (public items) can use it too.

export interface WallOrderable {
  featured?: boolean;
  hangOrder?: number;
  onWalls?: boolean;
  addedAt: number;
}

/**
 * The cards that hang, in hang order: `onWalls === false` is excluded
 * (binder-only), featured cards come first, then manual `hangOrder`
 * ascending (absent = last), then upload order. Stable for ties.
 */
export function orderForWalls<T extends WallOrderable>(cards: T[]): T[] {
  return cards
    .filter((c) => c.onWalls !== false)
    .sort((a, b) => {
      const fa = a.featured ? 0 : 1;
      const fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const ha = a.hangOrder ?? Number.POSITIVE_INFINITY;
      const hb = b.hangOrder ?? Number.POSITIVE_INFINITY;
      if (ha !== hb) return ha - hb;
      return a.addedAt - b.addedAt;
    });
}

/** The complement: cards curated OFF the walls (for dimmed display in curate mode). */
export function hiddenFromWalls<T extends WallOrderable>(cards: T[]): T[] {
  return cards.filter((c) => c.onWalls === false);
}
