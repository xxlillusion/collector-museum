-- 0007: anonymous walk counters (UX wave).
--
-- visit_counts: one row per public walkable thing — a show hall, a vendor
-- museum, a collector museum — holding a single number: how many times it
-- has been walked. Deliberately the dumbest possible analytics: no visitor
-- identifiers, no timestamps, no per-person anything, so the privacy page's
-- promises stay honest. Clients day-dedupe per browser via localStorage;
-- the counter is best-effort by design.
--
-- No direct write path: the table has a public SELECT policy and nothing
-- else — every increment goes through the record_walk() RPC below
-- (security definer, granted to anon + authenticated).

-- ------------------------------------------------------------- pg_graphql

-- The client feature-detects THIS migration through the GraphQL endpoint
-- before making any REST call: /graphql/v1 exists on every Supabase project
-- and always answers HTTP 200 (schema errors ride the JSON body), whereas a
-- blind REST call against an unapplied migration 404s — and Chromium prints
-- an unsuppressable "Failed to load resource" console error for every
-- non-2xx response, exactly the noise the graceful-degradation requirement
-- forbids (cousin of the storage.download() 400 gotcha). pg_graphql
-- respects RLS and role grants identically to REST, so enabling it exposes
-- no data PostgREST doesn't already expose.
create extension if not exists pg_graphql;

create table public.visit_counts (
  kind text not null check (kind in ('show', 'vendor', 'collector')),
  target_id uuid not null,
  walks bigint not null default 0,
  primary key (kind, target_id)
);

alter table public.visit_counts enable row level security;

-- Anyone may read the numbers — they render on public pages.
create policy "visit counts are public"
  on public.visit_counts for select
  using (true);

-- ------------------------------------------------------------ record_walk

-- Upsert-increment one counter. Security definer so anonymous visitors can
-- bump it without any table-level write grant; search_path pinned like the
-- other definer functions. An unknown kind no-ops rather than raising — the
-- client only sends the three known values, but a handcrafted request
-- shouldn't be able to produce a 500 (or probe the check constraint).
create function public.record_walk(p_kind text, p_target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_kind not in ('show', 'vendor', 'collector') then
    return;
  end if;
  insert into public.visit_counts as vc (kind, target_id, walks)
  values (p_kind, p_target, 1)
  on conflict (kind, target_id) do update
    set walks = vc.walks + 1;
end;
$$;

-- Execute is opt-in: drop the default PUBLIC grant, then grant exactly the
-- two API roles.
revoke execute on function public.record_walk(text, uuid) from public;
grant execute on function public.record_walk(text, uuid) to anon, authenticated;
