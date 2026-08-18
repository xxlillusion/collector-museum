// Card-metadata display helpers shared by the museum placard (InspectOverlay
// details line), home-screen tiles and public collector pages.

export interface CardMetaFields {
  setName?: string;
  cardNumber?: string;
  year?: string;
  grade?: string;
  notes?: string;
  /** Raw condition ("NM", "LP"). Suppressed on the line when a grade is set. */
  condition?: string;
  /** Copies owned; only rendered above 1, so pre-import cards are unaffected. */
  quantity?: number;
}

export function hasCardMeta(m: CardMetaFields): boolean {
  return Boolean(
    m.setName || m.cardNumber || m.year || m.grade || m.notes || m.condition ||
      (m.quantity ?? 1) > 1,
  );
}

/** "Base Set · #4/102 · 1999 · PSA 9 · ×3 — first pull" ('' when nothing set). */
export function cardDetailsLine(m: CardMetaFields): string {
  const parts = [
    m.setName,
    m.cardNumber ? `#${m.cardNumber.replace(/^#/, '')}` : undefined,
    m.year,
    m.grade,
    // A graded slab's condition IS its grade — showing "PSA 9 · NM" reads wrong.
    m.grade ? undefined : m.condition,
    typeof m.quantity === 'number' && m.quantity > 1 ? `×${m.quantity}` : undefined,
  ].filter(Boolean);
  const line = parts.join(' · ');
  if (m.notes) return line ? `${line} — ${m.notes}` : m.notes;
  return line;
}
