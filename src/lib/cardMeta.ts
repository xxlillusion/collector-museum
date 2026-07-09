// Card-metadata display helpers shared by the museum placard (InspectOverlay
// details line), home-screen tiles and public collector pages.

export interface CardMetaFields {
  setName?: string;
  cardNumber?: string;
  year?: string;
  grade?: string;
  notes?: string;
}

export function hasCardMeta(m: CardMetaFields): boolean {
  return Boolean(m.setName || m.cardNumber || m.year || m.grade || m.notes);
}

/** "Base Set · #4/102 · 1999 · PSA 9 — first pull" ('' when nothing set). */
export function cardDetailsLine(m: CardMetaFields): string {
  const parts = [
    m.setName,
    m.cardNumber ? `#${m.cardNumber.replace(/^#/, '')}` : undefined,
    m.year,
    m.grade,
  ].filter(Boolean);
  const line = parts.join(' · ');
  if (m.notes) return line ? `${line} — ${m.notes}` : m.notes;
  return line;
}
