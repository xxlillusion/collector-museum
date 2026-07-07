-- Vendor Museum — demo seed for the public shows directory.
--
-- HOW TO RUN: paste into the Supabase dashboard SQL editor (it runs as the
-- service role, bypassing RLS) AFTER applying migrations/0001_init.sql and
-- AFTER creating at least one auth user (sign up in the app or via the
-- dashboard). Then:
--
--   1. Replace every occurrence of the placeholder organizer id below
--      (00000000-0000-0000-0000-000000000000) with a real auth user id —
--      find yours with:  select id, email from auth.users;
--      (The profiles row for that user already exists via the signup trigger.)
--   2. Run the script. It is idempotent: shows upsert by fixed id, booths
--      are wiped and re-inserted for the two seeded shows only.
--
-- LIMITATION: plan *images* live in Storage and cannot be seeded via SQL, so
-- these shows have plan_image_path = null. They exercise the /shows directory
-- and /show/:id detail pages, but "Walk this show" stays disabled until a
-- plan image exists — the in-app publish flow (Convention View editor →
-- "Publish to Card Shows…") is the full-fidelity path. If you want a seeded
-- show walkable, upload any floor-plan image to the `plans` bucket at
-- `<show id>/plan.webp` via the dashboard and set plan_image_path to match.
--
-- Geometry notes: booth rects are in floor-plan-image pixels (VendorRect
-- verbatim: { id, x, y, w, h, rotationDeg? }). plan_meta carries the scale
-- (pxPerMeter) and image dims (imgW/imgH) that planToLayout needs; the rects
-- below are sized like real 6 ft / 8 ft tables at that scale so the derived
-- hall is plausible.

-- ------------------------------------------------------------- show 1
-- "Riverside Card Expo": 1000x700 px plan at 34 px/m, 6 ft standard.
-- A 6 ft table at 34 px/m is ~62 x 26 px.

insert into public.shows (id, organizer_id, name, show_date, plan_image_path, plan_meta, published)
values (
  'aaaaaaaa-1111-2222-3333-444444444444',
  '00000000-0000-0000-0000-000000000000', -- <<< REPLACE with your auth user id
  'Riverside Card Expo',
  (current_date + interval '21 days')::date, -- upcoming
  null, -- plan images can't be seeded via SQL (see header)
  '{"pxPerMeter": 34, "pxPerMeterSource": "inferred", "tableLengthFt": 6, "imgW": 1000, "imgH": 700, "updatedAt": 1751760000000, "startPx": {"x": 500, "y": 640}}'::jsonb,
  true
)
on conflict (id) do update set
  name = excluded.name,
  show_date = excluded.show_date,
  plan_meta = excluded.plan_meta,
  published = excluded.published,
  updated_at = now();

delete from public.booths where show_id = 'aaaaaaaa-1111-2222-3333-444444444444';

insert into public.booths (show_id, rect, vendor_id, label) values
  -- north wall run, four 6-ft booths
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-a", "x": 120, "y":  80, "w": 124, "h": 26}'::jsonb, null, 'A1'),
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-b", "x": 280, "y":  80, "w": 124, "h": 26}'::jsonb, null, 'A2'),
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-c", "x": 440, "y":  80, "w": 124, "h": 26}'::jsonb, null, 'A3'),
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-d", "x": 600, "y":  80, "w": 124, "h": 26}'::jsonb, null, 'A4'),
  -- center island, two back-to-back double booths
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-e", "x": 300, "y": 300, "w": 124, "h": 52}'::jsonb, null, 'B1'),
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-f", "x": 520, "y": 300, "w": 124, "h": 52}'::jsonb, null, 'B2'),
  -- a rotated corner booth
  ('aaaaaaaa-1111-2222-3333-444444444444', '{"id": "seed1-g", "x": 780, "y": 200, "w": 124, "h": 26, "rotationDeg": 45}'::jsonb, null, 'C1');

-- ------------------------------------------------------------- show 2
-- "Harbor City Collectibles Fair" (past show): 1200x800 px plan at 25 px/m,
-- 8 ft standard. An 8 ft table at 25 px/m is ~61 x 19 px.

insert into public.shows (id, organizer_id, name, show_date, plan_image_path, plan_meta, published)
values (
  'bbbbbbbb-1111-2222-3333-444444444444',
  '00000000-0000-0000-0000-000000000000', -- <<< REPLACE with your auth user id
  'Harbor City Collectibles Fair',
  (current_date - interval '30 days')::date, -- past
  null,
  '{"pxPerMeter": 25, "pxPerMeterSource": "manual", "tableLengthFt": 8, "imgW": 1200, "imgH": 800, "updatedAt": 1751760000000}'::jsonb,
  true
)
on conflict (id) do update set
  name = excluded.name,
  show_date = excluded.show_date,
  plan_meta = excluded.plan_meta,
  published = excluded.published,
  updated_at = now();

delete from public.booths where show_id = 'bbbbbbbb-1111-2222-3333-444444444444';

insert into public.booths (show_id, rect, vendor_id, label) values
  ('bbbbbbbb-1111-2222-3333-444444444444', '{"id": "seed2-a", "x": 150, "y": 120, "w": 122, "h": 19}'::jsonb, null, '101'),
  ('bbbbbbbb-1111-2222-3333-444444444444', '{"id": "seed2-b", "x": 330, "y": 120, "w": 122, "h": 19}'::jsonb, null, '102'),
  ('bbbbbbbb-1111-2222-3333-444444444444', '{"id": "seed2-c", "x": 510, "y": 120, "w": 122, "h": 19}'::jsonb, null, '103'),
  ('bbbbbbbb-1111-2222-3333-444444444444', '{"id": "seed2-d", "x": 240, "y": 420, "w": 244, "h": 19}'::jsonb, null, '201-202'),
  ('bbbbbbbb-1111-2222-3333-444444444444', '{"id": "seed2-e", "x": 640, "y": 420, "w": 122, "h": 38}'::jsonb, null, '203');

-- Optional: to attach vendors to seeded booths, create vendors in the app
-- (or insert into public.vendors here) and set booths.vendor_id — the
-- detail page then lists them and the 3D walk letters their names on the
-- tablecloths.
