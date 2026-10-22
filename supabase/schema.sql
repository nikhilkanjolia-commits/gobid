-- GoBid tender search database. Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run again: it only creates what's missing and replaces the functions.

create table if not exists public.tenders (
  bid_number        text primary key,          -- e.g. GEM/2026/B/8145103
  source            text not null default 'gem',
  gem_bid_id        bigint,
  bid_kind          text,                      -- BID or RA (reverse auction)
  parent_bid_number text,
  items             text not null default '',  -- item / category names as listed on GeM
  quantity          numeric,
  ministry          text,
  department        text,
  starts_at         timestamptz,               -- bid start (publish) time, India time
  ends_at           timestamptz,               -- bid end (closing) time, India time
  is_high_value     boolean not null default false,
  has_boq           boolean not null default false,
  document_url      text,                      -- GeM bid document (opened by the user, never downloaded by GoBid)
  matched_keywords  text[] not null default '{}',
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  search            tsvector generated always as (
    to_tsvector('simple', coalesce(items, '') || ' ' || coalesce(ministry, '') || ' ' || coalesce(department, '') || ' ' || bid_number)
  ) stored
);

create index if not exists tenders_search_idx on public.tenders using gin (search);
create index if not exists tenders_starts_idx on public.tenders (starts_at desc);
create index if not exists tenders_ends_idx on public.tenders (ends_at);

create table if not exists public.collector_runs (
  id            bigserial primary key,
  ran_at        timestamptz not null default now(),
  requests      int,
  bids_received int,
  bids_new      int,
  bids_updated  int
);

-- Only the server (service_role key) may read or write; nothing is exposed to browsers.
alter table public.tenders enable row level security;
alter table public.collector_runs enable row level security;

-- Saves one collector run: inserts new bids, refreshes existing ones (keeping first_seen_at
-- and adding any new matching keywords), and logs the run.
create or replace function public.upsert_gem_tenders(rows jsonb, requests int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_new int;
  n_updated int;
begin
  with incoming as (
    select * from jsonb_to_recordset(rows) as r(
      bid_number text, source text, gem_bid_id bigint, bid_kind text, parent_bid_number text, items text,
      quantity numeric, ministry text, department text, starts_at timestamptz, ends_at timestamptz,
      is_high_value boolean, has_boq boolean, document_url text, matched_keywords text[], last_seen_at timestamptz
    )
  ), saved as (
    insert into tenders as t (
      bid_number, source, gem_bid_id, bid_kind, parent_bid_number, items, quantity, ministry, department,
      starts_at, ends_at, is_high_value, has_boq, document_url, matched_keywords, first_seen_at, last_seen_at
    )
    select bid_number, coalesce(source, 'gem'), gem_bid_id, bid_kind, parent_bid_number, coalesce(items, ''), quantity,
           ministry, department, starts_at, ends_at, coalesce(is_high_value, false), coalesce(has_boq, false),
           document_url, coalesce(matched_keywords, '{}'), coalesce(last_seen_at, now()), coalesce(last_seen_at, now())
    from incoming
    on conflict (bid_number) do update set
      items = excluded.items,
      quantity = excluded.quantity,
      ministry = excluded.ministry,
      department = excluded.department,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      is_high_value = excluded.is_high_value,
      has_boq = excluded.has_boq,
      document_url = excluded.document_url,
      matched_keywords = array(select distinct k from unnest(t.matched_keywords || excluded.matched_keywords) as k order by k),
      last_seen_at = excluded.last_seen_at
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into n_new, n_updated from saved;

  insert into collector_runs (requests, bids_received, bids_new, bids_updated)
  values (requests, jsonb_array_length(rows), n_new, n_updated);

  return jsonb_build_object('received', jsonb_array_length(rows), 'new', n_new, 'updated', n_updated);
end;
$$;

-- Search used by GET /api/tenders. q matches words in items/ministry/department/bid number
-- (all words must match) or a plain substring of the items or bid number.
create or replace function public.search_tenders(
  q text default null,
  p_ministry text default null,
  open_only boolean default true,
  closing_from timestamptz default null,
  closing_to timestamptz default null,
  sort text default 'publish_date_desc',
  page_size int default 20,
  page_offset int default 0
)
returns table (
  bid_number text, bid_kind text, items text, quantity numeric, ministry text, department text,
  starts_at timestamptz, ends_at timestamptz, is_high_value boolean, has_boq boolean, document_url text,
  matched_keywords text[], first_seen_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select t.bid_number, t.bid_kind, t.items, t.quantity, t.ministry, t.department, t.starts_at, t.ends_at,
         t.is_high_value, t.has_boq, t.document_url, t.matched_keywords, t.first_seen_at,
         count(*) over () as total_count
  from tenders t
  where (coalesce(q, '') = ''
         or t.search @@ plainto_tsquery('simple', q)
         or t.items ilike '%' || q || '%'
         or t.bid_number ilike '%' || q || '%')
    and (coalesce(p_ministry, '') = '' or t.ministry ilike '%' || p_ministry || '%')
    and (not open_only or t.ends_at > now())
    and (closing_from is null or t.ends_at >= closing_from)
    and (closing_to is null or t.ends_at <= closing_to)
  order by
    case when sort = 'closing_date_asc' then t.ends_at end asc nulls last,
    case when sort = 'closing_date_desc' then t.ends_at end desc nulls last,
    t.starts_at desc nulls last,
    t.bid_number
  limit greatest(1, least(page_size, 100))
  offset greatest(0, page_offset);
$$;

-- Functions run with the owner's rights, so only the server key may call them.
revoke all on function public.upsert_gem_tenders(jsonb, int) from public, anon, authenticated;
revoke all on function public.search_tenders(text, text, boolean, timestamptz, timestamptz, text, int, int) from public, anon, authenticated;
grant execute on function public.upsert_gem_tenders(jsonb, int) to service_role;
grant execute on function public.search_tenders(text, text, boolean, timestamptz, timestamptz, text, int, int) to service_role;
