-- 0005: commerce, contact, and logistics fields (roadmap "Now" phase).
--
-- inventory_items gain sale metadata (price / status / condition) so binder
-- inspection and vendor pages can show more than image + caption. vendors
-- gain public contact links. shows gain the logistics a visitor needs to
-- actually attend (venue, address, hours, admission, external link).
-- All additive with defaults — no RLS, trigger, or storage changes.

-- --------------------------------------------------------- inventory_items

alter table public.inventory_items
  -- null = no price shown (display-only or "ask").
  add column price numeric(10, 2),
  -- Values match the client-side union verbatim (like manual_shows jsonb,
  -- camelCase crosses the wire unmapped).
  add column status text not null default 'forSale'
    check (status in ('forSale', 'sold', 'display')),
  -- Free text: "NM", "LP", "PSA 9", ... empty = unstated.
  add column condition text not null default '';

-- ----------------------------------------------------------------- vendors

alter table public.vendors
  add column website text not null default '',
  add column contact_email text not null default '',
  add column instagram text not null default '';  -- handle without the @

-- ------------------------------------------------------------------- shows

alter table public.shows
  add column venue_name text not null default '',
  add column address text not null default '',
  add column hours text not null default '',      -- free text: "Sat 9–4"
  add column admission text not null default '',  -- free text: "$5, kids free"
  add column external_url text not null default '';
