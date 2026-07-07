-- Vendor Museum platform schema (Phase 0).
-- Apply via the Supabase dashboard SQL editor or `supabase db push`.
-- Image paths reference Storage objects (buckets created at the bottom);
-- clients downscale (<=1600px WebP) before upload, same as the local app.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  -- Primary role; users can upgrade (collector -> vendor/organizer) later.
  role text not null default 'collector' check (role in ('collector', 'vendor', 'organizer')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------- vendors

create table public.vendors (
  -- Client may supply the id (guest->account import keeps local UUIDs).
  id uuid primary key default gen_random_uuid(),
  -- Nullable: curated/unclaimed vendor profiles remain possible.
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  banner_path text,
  -- VendorShowEntry[] verbatim (manual "shows attended"; plan-derived shows
  -- come from booths joins, computed live).
  manual_shows jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------- inventory_items

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  image_path text not null,
  caption text not null default '',
  visible boolean not null default true,
  aspect real not null default 0.714, -- width/height, computed at upload
  added_at timestamptz not null default now()
);
create index inventory_items_vendor_idx on public.inventory_items (vendor_id);

-- ------------------------------------------------------------------- shows

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id),
  name text not null,
  show_date date,
  plan_image_path text,
  -- VendorPlanMeta minus rects (pxPerMeter(+Source), startPx, tableLengthFt,
  -- imgW, imgH); rects are normalized into booths rows.
  plan_meta jsonb not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booths (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  -- VendorRect geometry verbatim: { x, y, w, h, rotationDeg? } in plan px.
  rect jsonb not null,
  vendor_id uuid references public.vendors (id) on delete set null,
  label text
);
create index booths_show_idx on public.booths (show_id);
create index booths_vendor_idx on public.booths (vendor_id);

-- ------------------------------------------------------------- collections

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  image_path text not null,
  name text not null default '',
  aspect real not null default 0.714,
  -- Future card metadata (set/number/grade) — a column now means no
  -- migration later; UI is deferred.
  metadata jsonb not null default '{}',
  added_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections (owner_id);

-- ---------------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.inventory_items enable row level security;
alter table public.shows enable row level security;
alter table public.booths enable row level security;
alter table public.collections enable row level security;

-- profiles: public directory info; only the owner mutates.
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);
create policy "users update own profile"
  on public.profiles for update using (id = auth.uid());

-- vendors: public directory; owner mutates.
create policy "vendors are readable by everyone"
  on public.vendors for select using (true);
create policy "owners insert own vendor"
  on public.vendors for insert with check (owner_id = auth.uid());
create policy "owners update own vendor"
  on public.vendors for update using (owner_id = auth.uid());
create policy "owners delete own vendor"
  on public.vendors for delete using (owner_id = auth.uid());

-- inventory: visible items are public; owners see and mutate everything.
create policy "visible inventory or own"
  on public.inventory_items for select
  using (
    visible
    or exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );
create policy "vendor owners insert inventory"
  on public.inventory_items for insert
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );
create policy "vendor owners update inventory"
  on public.inventory_items for update
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );
create policy "vendor owners delete inventory"
  on public.inventory_items for delete
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );

-- shows: published are public; organizers see and mutate their own.
create policy "published shows or own"
  on public.shows for select
  using (published or organizer_id = auth.uid());
create policy "organizers insert own show"
  on public.shows for insert with check (organizer_id = auth.uid());
create policy "organizers update own show"
  on public.shows for update using (organizer_id = auth.uid());
create policy "organizers delete own show"
  on public.shows for delete using (organizer_id = auth.uid());

-- booths: visibility and mutation ride the parent show.
create policy "booths of visible shows"
  on public.booths for select
  using (
    exists (
      select 1 from public.shows s
      where s.id = show_id and (s.published or s.organizer_id = auth.uid())
    )
  );
create policy "show organizers insert booths"
  on public.booths for insert
  with check (
    exists (
      select 1 from public.shows s
      where s.id = show_id and s.organizer_id = auth.uid()
    )
  );
create policy "show organizers update booths"
  on public.booths for update
  using (
    exists (
      select 1 from public.shows s
      where s.id = show_id and s.organizer_id = auth.uid()
    )
  );
create policy "show organizers delete booths"
  on public.booths for delete
  using (
    exists (
      select 1 from public.shows s
      where s.id = show_id and s.organizer_id = auth.uid()
    )
  );

-- collections: private to the owner (public museums are a later feature).
create policy "owners read own collection"
  on public.collections for select using (owner_id = auth.uid());
create policy "owners insert own collection"
  on public.collections for insert with check (owner_id = auth.uid());
create policy "owners update own collection"
  on public.collections for update using (owner_id = auth.uid());
create policy "owners delete own collection"
  on public.collections for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------------ storage
-- Path convention: <owning id>/<uuid>.webp
--   banners/, inventory/  -> first segment = vendor id (owned)
--   plans/                -> first segment = show id (organized)
--   cards/                -> first segment = auth.uid()

insert into storage.buckets (id, name, public)
values
  ('banners', 'banners', true),
  ('inventory', 'inventory', true),
  ('plans', 'plans', true),
  ('cards', 'cards', false)
on conflict (id) do nothing;

create policy "vendor owners write banner objects"
  on storage.objects for insert
  with check (
    bucket_id in ('banners', 'inventory')
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_id = auth.uid()
    )
  );
create policy "vendor owners delete banner objects"
  on storage.objects for delete
  using (
    bucket_id in ('banners', 'inventory')
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_id = auth.uid()
    )
  );

create policy "organizers write plan objects"
  on storage.objects for insert
  with check (
    bucket_id = 'plans'
    and exists (
      select 1 from public.shows s
      where s.id::text = (storage.foldername(name))[1] and s.organizer_id = auth.uid()
    )
  );
create policy "organizers delete plan objects"
  on storage.objects for delete
  using (
    bucket_id = 'plans'
    and exists (
      select 1 from public.shows s
      where s.id::text = (storage.foldername(name))[1] and s.organizer_id = auth.uid()
    )
  );

create policy "owners read own card objects"
  on storage.objects for select
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners write own card objects"
  on storage.objects for insert
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete own card objects"
  on storage.objects for delete
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
