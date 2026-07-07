-- 0002: subquery-free storage policies.
--
-- The 0001 policies authorized banners/inventory/plans writes by subquerying
-- public tables (vendors/shows ownership). Those subqueries are not reliably
-- evaluated in the storage service's policy context — legitimate owners got
-- 403 "new row violates row-level security policy" on upload — while the
-- cards policy (a plain auth.uid() path-prefix check) works. Verified on this
-- project 2026-07-06.
--
-- Fix: every object path now begins with the OWNER's uid —
--   banners/    <ownerId>/<vendorId>/banner.webp
--   inventory/  <ownerId>/<vendorId>/<itemId>.webp
--   plans/      <organizerId>/<showId>/plan.webp
--   cards/      <ownerId>/<cardId>.webp   (unchanged)
-- and all write policies are prefix checks. Public reads are unaffected
-- (banners/inventory/plans are public buckets; readers use the *_path
-- columns stored on the rows, never reconstructed paths).

drop policy if exists "vendor owners write banner objects" on storage.objects;
drop policy if exists "vendor owners delete banner objects" on storage.objects;
drop policy if exists "organizers write plan objects" on storage.objects;
drop policy if exists "organizers delete plan objects" on storage.objects;

create policy "owners write own public image objects"
  on storage.objects for insert
  with check (
    bucket_id in ('banners', 'inventory', 'plans')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners delete own public image objects"
  on storage.objects for delete
  using (
    bucket_id in ('banners', 'inventory', 'plans')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
