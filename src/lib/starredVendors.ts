// Pre-show route planning: which vendors the visitor starred on a show's
// detail page. Pure localStorage — works for anonymous visitors, per browser,
// keyed by show id. Starred booths glow on the in-hall minimap.

const key = (showId: string) => `vendor-museum:starred:${showId}`;

export function getStarredVendors(showId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(showId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function toggleStarredVendor(showId: string, vendorId: string): Set<string> {
  const next = getStarredVendors(showId);
  if (next.has(vendorId)) next.delete(vendorId);
  else next.add(vendorId);
  try {
    if (next.size === 0) localStorage.removeItem(key(showId));
    else localStorage.setItem(key(showId), JSON.stringify([...next]));
  } catch {
    // storage full/denied — the in-memory set still drives this session
  }
  return next;
}
