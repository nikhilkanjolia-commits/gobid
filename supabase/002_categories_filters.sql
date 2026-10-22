-- GoBid step 2: categories, editable collector keywords, tabs and more filters.
-- Run after schema.sql (Supabase → SQL Editor → paste → Run). Safe to run again.

-- What the hourly collector searches GeM for. Edit rows here (or on the site's Settings page)
-- to change what gets collected: no code change needed.
create table if not exists public.search_keywords (
  keyword    text primary key,             -- searched on GeM as-is, e.g. "MCCB"
  category   text not null,                -- groups keywords for the filters, e.g. "Switchgear"
  enabled    boolean not null default true,
  pages      int not null default 2 check (pages between 1 and 5),  -- 10 newest bids per page
  created_at timestamptz not null default now()
);
alter table public.search_keywords enable row level security;

insert into public.search_keywords (keyword, category) values
  ('MCB', 'Switchgear'), ('MCCB', 'Switchgear'), ('RCCB', 'Switchgear'), ('ACB', 'Switchgear'),
  ('switchgear', 'Switchgear'), ('distribution board', 'Switchgear'), ('LT panel', 'Switchgear'),
  ('cable', 'Cables & Wires'), ('wire', 'Cables & Wires'),
  ('LED', 'Lighting'), ('street light', 'Lighting'), ('high mast', 'Lighting'),
  ('solar', 'Solar & Power'), ('inverter', 'Solar & Power'), ('UPS', 'Solar & Power'), ('transformer', 'Solar & Power'),
  ('earthing', 'Electrical General'), ('electrical', 'Electrical General')
on conflict (keyword) do nothing;

create index if not exists tenders_keywords_idx on public.tenders using gin (matched_keywords);
create index if not exists tenders_first_seen_idx on public.tenders (first_seen_at desc);

-- Keywords for the collector: enabled only, at most 40 (keeps one run under ~3 minutes).
create or replace function public.get_collect_keywords()
returns table (keyword text, pages int)
language sql stable security definer set search_path = public
as $$
  select keyword, pages from search_keywords where enabled order by category, keyword limit 40;
$$;

create or replace function public.list_search_keywords()
returns table (keyword text, category text, enabled boolean, pages int)
language sql stable security definer set search_path = public
as $$
  select keyword, category, enabled, pages from search_keywords order by category, keyword;
$$;

create or replace function public.save_search_keyword(p_keyword text, p_category text, p_enabled boolean default true, p_pages int default 2)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(trim(p_keyword), '') = '' or coalesce(trim(p_category), '') = '' then
    raise exception 'keyword and category are required';
  end if;
  insert into search_keywords (keyword, category, enabled, pages)
  values (trim(p_keyword), trim(p_category), coalesce(p_enabled, true), coalesce(p_pages, 2))
  on conflict (keyword) do update set category = excluded.category, enabled = excluded.enabled, pages = excluded.pages;
end;
$$;

create or replace function public.delete_search_keyword(p_keyword text)
returns void
language sql security definer set search_path = public
as $$
  delete from search_keywords where keyword = p_keyword;
$$;

-- Which status tab a bid falls under.
--   live          closing date still ahead
--   closing_soon  closes within the next 3 days
--   new           first seen by GoBid in the last 24 hours and still open
--   closed        closing date passed
--   all           everything
create or replace function public.tender_in_tab(t public.tenders, tab text)
returns boolean
language sql stable
as $$
  select case coalesce(tab, 'live')
    when 'live' then t.ends_at > now()
    when 'closing_soon' then t.ends_at > now() and t.ends_at <= now() + interval '3 days'
    when 'new' then t.first_seen_at > now() - interval '24 hours' and t.ends_at > now()
    when 'closed' then t.ends_at <= now()
    else true
  end;
$$;

-- Shared filter used by the search and the filter counts.
create or replace function public.tender_matches(
  t public.tenders, q text, p_ministry text, tab text, p_categories text[], p_keywords text[],
  p_kind text, high_value_only boolean, closing_from timestamptz, closing_to timestamptz
)
returns boolean
language sql stable
as $$
  select public.tender_in_tab(t, tab)
    and (coalesce(q, '') = '' or t.search @@ plainto_tsquery('simple', q) or t.items ilike '%' || q || '%' or t.bid_number ilike '%' || q || '%')
    and (coalesce(p_ministry, '') = '' or t.ministry ilike '%' || p_ministry || '%')
    and (coalesce(array_length(p_keywords, 1), 0) = 0 or t.matched_keywords && p_keywords)
    and (coalesce(array_length(p_categories, 1), 0) = 0 or exists (
          select 1 from public.search_keywords k where k.keyword = any (t.matched_keywords) and k.category = any (p_categories)))
    and (coalesce(p_kind, '') = '' or t.bid_kind = p_kind)
    and (not coalesce(high_value_only, false) or t.is_high_value)
    and (closing_from is null or t.ends_at >= closing_from)
    and (closing_to is null or t.ends_at <= closing_to);
$$;

drop function if exists public.search_tenders(text, text, boolean, timestamptz, timestamptz, text, int, int);

create or replace function public.search_tenders(
  q text default null,
  p_ministry text default null,
  tab text default 'live',
  p_categories text[] default null,
  p_keywords text[] default null,
  p_kind text default null,
  high_value_only boolean default false,
  closing_from timestamptz default null,
  closing_to timestamptz default null,
  sort text default 'publish_date_desc',
  page_size int default 20,
  page_offset int default 0
)
returns table (
  bid_number text, bid_kind text, items text, quantity numeric, ministry text, department text,
  starts_at timestamptz, ends_at timestamptz, is_high_value boolean, has_boq boolean, document_url text,
  matched_keywords text[], categories text[], first_seen_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public
as $$
  select t.bid_number, t.bid_kind, t.items, t.quantity, t.ministry, t.department, t.starts_at, t.ends_at,
         t.is_high_value, t.has_boq, t.document_url, t.matched_keywords,
         array(select distinct k.category from search_keywords k where k.keyword = any (t.matched_keywords) order by 1),
         t.first_seen_at,
         count(*) over () as total_count
  from tenders t
  where tender_matches(t, q, p_ministry, tab, p_categories, p_keywords, p_kind, high_value_only, closing_from, closing_to)
  order by
    case when sort = 'closing_date_asc' then t.ends_at end asc nulls last,
    case when sort = 'closing_date_desc' then t.ends_at end desc nulls last,
    case when sort = 'first_seen_desc' then t.first_seen_at end desc nulls last,
    t.starts_at desc nulls last,
    t.bid_number
  limit greatest(1, least(page_size, 100))
  offset greatest(0, page_offset);
$$;

-- Counts for the tabs and the filter panel. Tab counts ignore the tab itself; category,
-- keyword and ministry counts are for the chosen tab and search text.
create or replace function public.tender_facets(q text default null, tab text default 'live')
returns jsonb
language sql stable security definer set search_path = public
as $$
  with base as (
    select t.* from tenders t
    where coalesce(q, '') = '' or t.search @@ plainto_tsquery('simple', q) or t.items ilike '%' || q || '%' or t.bid_number ilike '%' || q || '%'
  ), in_tab as (
    select * from base b where tender_in_tab(b, tab)
  )
  select jsonb_build_object(
    'tabs', jsonb_build_object(
      'live', (select count(*) from base b where tender_in_tab(b, 'live')),
      'closing_soon', (select count(*) from base b where tender_in_tab(b, 'closing_soon')),
      'new', (select count(*) from base b where tender_in_tab(b, 'new')),
      'closed', (select count(*) from base b where tender_in_tab(b, 'closed')),
      'all', (select count(*) from base)
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'count', n) order by category)
      from (
        select k.category, count(distinct i.bid_number) as n
        from search_keywords k left join in_tab i on k.keyword = any (i.matched_keywords)
        group by k.category
      ) c
    ), '[]'::jsonb),
    'keywords', coalesce((
      select jsonb_agg(jsonb_build_object('keyword', keyword, 'category', category, 'count', n) order by category, keyword)
      from (
        select k.keyword, k.category, count(i.bid_number) as n
        from search_keywords k left join in_tab i on k.keyword = any (i.matched_keywords)
        group by k.keyword, k.category
      ) w
    ), '[]'::jsonb),
    'ministries', coalesce((
      select jsonb_agg(jsonb_build_object('ministry', ministry, 'count', n) order by n desc, ministry)
      from (select ministry, count(*) as n from in_tab where ministry is not null group by ministry order by n desc, ministry limit 40) m
    ), '[]'::jsonb),
    'kinds', jsonb_build_object(
      'BID', (select count(*) from in_tab where bid_kind = 'BID'),
      'RA', (select count(*) from in_tab where bid_kind = 'RA')
    ),
    'high_value', (select count(*) from in_tab where is_high_value),
    'last_run', (select to_jsonb(r) from (select ran_at, bids_received, bids_new from collector_runs order by id desc limit 1) r)
  );
$$;

-- Only the server key may call these.
do $$
declare f text;
begin
  foreach f in array array[
    'get_collect_keywords()', 'list_search_keywords()', 'save_search_keyword(text,text,boolean,int)', 'delete_search_keyword(text)',
    'search_tenders(text,text,text,text[],text[],text,boolean,timestamptz,timestamptz,text,int,int)', 'tender_facets(text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
