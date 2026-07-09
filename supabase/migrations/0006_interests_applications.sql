-- 0006: demand signals + self-serve booths (roadmap "Next" phase).
--
-- interests: a signed-in user marks "I'm interested" on an inventory item.
-- The item's vendor reads the rows on their own items (demand counts in the
-- registry). Guests keep a localStorage-only want-list client-side.
--
-- booth_applications: a vendor account applies to a published show; the
-- organizer approves/declines. Approval is a communication/tracking state —
-- booth assignment stays a manual editor action (which rect is the
-- organizer's call).

-- --------------------------------------------------------------- interests

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);
create index interests_item_idx on public.interests (item_id);

alter table public.interests enable row level security;

-- Users manage their own marks; the vendor who owns the item sees demand.
create policy "users insert own interest"
  on public.interests for insert
  with check (user_id = auth.uid());
create policy "users delete own interest"
  on public.interests for delete
  using (user_id = auth.uid());
create policy "own interests or vendor of item"
  on public.interests for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.inventory_items i
      join public.vendors v on v.id = i.vendor_id
      where i.id = item_id and v.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------ booth_applications

create table public.booth_applications (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  -- The store applying (a vendors row with profile_id = applicant).
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  unique (show_id, vendor_id)
);
create index booth_applications_show_idx on public.booth_applications (show_id);
create index booth_applications_applicant_idx on public.booth_applications (applicant_id);

alter table public.booth_applications enable row level security;

-- Apply with one of your OWN registered stores, to a PUBLISHED show only.
create policy "vendors apply with own store"
  on public.booth_applications for insert
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.profile_id = auth.uid()
    )
    and exists (
      select 1 from public.shows s
      where s.id = show_id and s.published
    )
  );
-- Applicants see + withdraw their own; organizers see applications to their shows.
create policy "own applications or organizer of show"
  on public.booth_applications for select
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.shows s
      where s.id = show_id and s.organizer_id = auth.uid()
    )
  );
create policy "applicants withdraw own application"
  on public.booth_applications for delete
  using (applicant_id = auth.uid());
-- Only the show's organizer moves status (approve / decline).
create policy "organizers update applications to own shows"
  on public.booth_applications for update
  using (
    exists (
      select 1 from public.shows s
      where s.id = show_id and s.organizer_id = auth.uid()
    )
  );
