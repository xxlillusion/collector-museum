-- 0008: 3D interactivity & customization wave.
--   * inventory_items.display_pref — per-item walls/binder/both display choice
--   * inventory_items.wall_slot    — museum wall slot pin ("N:0:3" style ids)
--   * vendors.booth_layout         — per-store booth layout config (jsonb)
--   * shows.signage                — organizer hall signage config (jsonb;
--                                    uploaded image paths live inside it)
-- Cards need nothing: collections.metadata jsonb carries display/wallSlot.
--
-- No RLS changes: the inventory columns ride the existing vendor-owner
-- policies, booth_layout rides "owners update own vendor", signage rides the
-- organizer show policies. No storage changes: signage images reuse the plans
-- bucket's 0002 uid-prefix write policy under
-- plans/<organizerId>/<showId>/signage-*.

alter table public.inventory_items
  add column if not exists display_pref text not null default 'both'
    check (display_pref in ('walls', 'binder', 'both')),
  add column if not exists wall_slot text;

alter table public.vendors
  add column if not exists booth_layout jsonb;

alter table public.shows
  add column if not exists signage jsonb;
