-- 0004: multiple stores per account (max 2), one designated "Flagship".
--
-- 0003 made vendors.profile_id UNIQUE — one canonical vendor per account.
-- A profile can now be tied to up to TWO registered stores ("Vendor" is a
-- store in this app). Exactly one of them is the flagship: the account's
-- default store (created first, shown first, seeded by the signup trigger).
-- Placeholder vendors (profile_id null, organizer quick-creates) unchanged.

-- ----------------------------------------------------------------- vendors

alter table public.vendors drop constraint if exists vendors_profile_id_key;
create index if not exists vendors_profile_idx
  on public.vendors (profile_id) where profile_id is not null;

alter table public.vendors
  add column is_flagship boolean not null default false;

-- Every existing canonical vendor becomes its account's flagship.
update public.vendors set is_flagship = true where profile_id is not null;

-- At most one flagship per profile (partial unique index).
create unique index vendors_one_flagship_per_profile
  on public.vendors (profile_id) where is_flagship and profile_id is not null;

-- ------------------------------------------------------------ store limit

-- Hard cap: two registered stores per profile. Client enforces it too; this
-- is the backstop against races / handcrafted requests.
create or replace function public.enforce_store_limit()
returns trigger
language plpgsql
as $$
begin
  if new.profile_id is not null and (
    select count(*) from public.vendors
    where profile_id = new.profile_id and id <> new.id
  ) >= 2 then
    raise exception 'Store limit reached — an account may hold at most 2 stores.';
  end if;
  return new;
end;
$$;

create trigger vendors_store_limit
  before insert or update of profile_id on public.vendors
  for each row execute function public.enforce_store_limit();

-- --------------------------------------------------------------------- RLS

-- profile_id may only point at the caller's own profile (a store is a
-- registered store OF the account that owns it; owner_id checks stay).
drop policy "owners insert own vendor" on public.vendors;
create policy "owners insert own vendor"
  on public.vendors for insert
  with check (
    owner_id = auth.uid()
    and (profile_id is null or profile_id = auth.uid())
  );
drop policy "owners update own vendor" on public.vendors;
create policy "owners update own vendor"
  on public.vendors for update
  using (owner_id = auth.uid())
  with check (profile_id is null or profile_id = auth.uid());

-- ---------------------------------------------------------- flagship swap

-- Unset-then-set in one transaction so the partial unique index never sees
-- two flagships. Security invoker: the caller's own RLS applies.
create or replace function public.set_flagship_store(store_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update public.vendors set is_flagship = false
    where profile_id = auth.uid() and is_flagship and id <> store_id;
  update public.vendors set is_flagship = true
    where id = store_id and profile_id = auth.uid() and not is_flagship;
end;
$$;

-- ------------------------------------------------- signup trigger rewrite

-- 0003 body + the auto-created first store is the flagship.
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
    insert into public.vendors (owner_id, profile_id, name, is_flagship)
    values (new.id, new.id, coalesce(nullif(v_display, ''), 'My Table'), true);
  end if;
  return new;
end;
$$;
