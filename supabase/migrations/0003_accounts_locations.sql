-- 0003: account types, organizer designation, locations, public collections.
--
-- profiles.role (0001's collector/vendor/organizer enum) is superseded:
-- account type (collector | vendor) and the organizer designation are
-- orthogonal — any account can self-designate as an organizer. The column is
-- kept, deprecated, so live dashboards/rows keep working; nothing in the app
-- reads it after this migration.

-- ---------------------------------------------------------------- profiles

alter table public.profiles
  add column account_type text not null default 'collector'
    check (account_type in ('collector', 'vendor')),
  add column is_organizer boolean not null default false,
  add column country text,
  add column state text,
  add column city text,
  add column bio text not null default '',
  add column collection_public boolean not null default false;

update public.profiles set account_type = 'vendor' where role = 'vendor';
update public.profiles set is_organizer = true where role = 'organizer';
comment on column public.profiles.role is
  'DEPRECATED (0003) — superseded by account_type + is_organizer.';

-- ----------------------------------------------------------------- vendors

-- profile_id non-null = this is a registered vendor account's canonical
-- vendor profile (created by the signup trigger below). Null = an unclaimed
-- placeholder an organizer quick-created while assigning booths (claiming
-- flow is future work). unique: one canonical vendor per account.
alter table public.vendors
  add column profile_id uuid unique references public.profiles (id) on delete set null,
  add column country text,
  add column state text,
  add column area_served text not null default '',
  -- Vendor-level gate ("does my profile/museum show inventory at all");
  -- per-item curation stays on inventory_items.visible.
  add column inventory_public boolean not null default true;

-- ------------------------------------------------------------------- shows

alter table public.shows
  add column country text,
  add column state text,
  add column city text;

-- ------------------------------------------------- signup trigger rewrite

-- Reads account_type from signup metadata; vendor accounts atomically get
-- their canonical vendor row (works whether email confirmation is on or off).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_display text := coalesce(new.raw_user_meta_data ->> 'display_name', '');
  v_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'collector');
begin
  if v_type not in ('collector', 'vendor') then
    v_type := 'collector';
  end if;
  insert into public.profiles (id, display_name, account_type)
  values (new.id, v_display, v_type);
  if v_type = 'vendor' then
    insert into public.vendors (owner_id, profile_id, name)
    values (new.id, new.id, coalesce(nullif(v_display, ''), 'My Table'));
  end if;
  return new;
end;
$$;

-- --------------------------------------------------------------------- RLS
-- Table policies may subquery freely; only STORAGE policies can't (0002).

-- Only organizer-designated accounts create/update shows. Delete stays
-- owner-only — you can always remove your own data after toggling off.
drop policy "organizers insert own show" on public.shows;
create policy "organizers insert own show"
  on public.shows for insert
  with check (
    organizer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_organizer
    )
  );
drop policy "organizers update own show" on public.shows;
create policy "organizers update own show"
  on public.shows for update
  using (
    organizer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_organizer
    )
  );

-- Collections become publicly readable when the owner opted in.
drop policy "owners read own collection" on public.collections;
create policy "owners or public read collection"
  on public.collections for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = owner_id and p.collection_public
    )
  );

-- Anon inventory visibility now composes the vendor-level gate with the
-- per-item flag; owners still see everything of their own.
drop policy "visible inventory or own" on public.inventory_items;
create policy "public inventory or own"
  on public.inventory_items for select
  using (
    (
      visible
      and exists (
        select 1 from public.vendors v
        where v.id = vendor_id and v.inventory_public
      )
    )
    or exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------- storage
-- Cards bucket goes public-read for public collector museums. A conditional
-- storage policy (checking profiles.collection_public) is impossible —
-- storage policies can't reliably subquery tables (verified, see 0002).
-- Paths are <uid>/<uuid>.webp (unguessable); discovery stays gated by the
-- collections table RLS above — the same privacy model banners/inventory
-- already use. The authed SELECT/INSERT/DELETE policies from 0001 remain
-- for owner reads/writes.

update storage.buckets set public = true where id = 'cards';
