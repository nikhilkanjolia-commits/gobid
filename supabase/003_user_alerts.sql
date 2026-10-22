-- GoBid step 3: signed-in users and their daily email alerts.
-- Run after 002_categories_filters.sql (Supabase → SQL Editor → paste → Run). Safe to run again.
-- Users sign in with Supabase Auth (email code); their rows live in auth.users.

create table if not exists public.user_alerts (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  categories        text[] not null default '{}',
  keywords          text[] not null default '{}',
  enabled           boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  last_sent_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Only the server (service_role) reads or writes these rows.
alter table public.user_alerts enable row level security;

create table if not exists public.digest_runs (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  recipients  int,
  sent        int,
  skipped     int,
  failed      int
);
alter table public.digest_runs enable row level security;

create or replace function public.get_user_alerts(p_user_id uuid)
returns table (email text, categories text[], keywords text[], enabled boolean, last_sent_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select email, categories, keywords, enabled, last_sent_at from user_alerts where user_id = p_user_id;
$$;

create or replace function public.save_user_alerts(p_user_id uuid, p_email text, p_categories text[], p_keywords text[], p_enabled boolean)
returns void
language sql security definer set search_path = public
as $$
  insert into user_alerts (user_id, email, categories, keywords, enabled)
  values (p_user_id, p_email, coalesce(p_categories, '{}'), coalesce(p_keywords, '{}'), coalesce(p_enabled, true))
  on conflict (user_id) do update set
    email = excluded.email, categories = excluded.categories, keywords = excluded.keywords,
    enabled = excluded.enabled, updated_at = now();
$$;

-- Who gets today's email: alerts on, something chosen, and not already sent in the last 20 h
-- (so a retried run never sends twice).
create or replace function public.get_digest_recipients()
returns table (user_id uuid, email text, categories text[], keywords text[], last_sent_at timestamptz, unsubscribe_token uuid)
language sql stable security definer set search_path = public
as $$
  select user_id, email, categories, keywords, last_sent_at, unsubscribe_token
  from user_alerts
  where enabled
    and (cardinality(categories) > 0 or cardinality(keywords) > 0)
    and (last_sent_at is null or last_sent_at < now() - interval '20 hours')
  order by created_at;
$$;

-- One user's digest: bids first seen since their last email (or the last 24 h) that are still
-- open, and bids closing within 3 days. A bid matches if it was found by one of their keywords
-- or by any keyword in one of their categories.
create or replace function public.digest_tenders(p_categories text[], p_keywords text[], p_since timestamptz)
returns table (section text, bid_number text, bid_kind text, items text, ministry text, department text,
               quantity numeric, ends_at timestamptz, document_url text, matched_keywords text[])
language sql stable security definer set search_path = public
as $$
  with mine as (
    select t.* from tenders t
    where t.ends_at > now()
      and (t.matched_keywords && coalesce(p_keywords, '{}')
           or exists (select 1 from search_keywords k
                      where k.keyword = any (t.matched_keywords) and k.category = any (coalesce(p_categories, '{}'))))
  )
  (select 'new', bid_number, bid_kind, items, ministry, department, quantity, ends_at, document_url, matched_keywords
   from mine where first_seen_at > coalesce(p_since, now() - interval '24 hours')
   order by ends_at limit 30)
  union all
  (select 'closing_soon', bid_number, bid_kind, items, ministry, department, quantity, ends_at, document_url, matched_keywords
   from mine where ends_at <= now() + interval '3 days'
   order by ends_at limit 10);
$$;

create or replace function public.mark_digest_sent(p_user_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update user_alerts set last_sent_at = now() where user_id = p_user_id;
$$;

create or replace function public.log_digest_run(p_recipients int, p_sent int, p_skipped int, p_failed int)
returns void
language sql security definer set search_path = public
as $$
  insert into digest_runs (recipients, sent, skipped, failed) values (p_recipients, p_sent, p_skipped, p_failed);
$$;

-- One-click unsubscribe from the email link. Returns the email it turned off, or null.
create or replace function public.unsubscribe_alerts(p_token uuid)
returns text
language sql security definer set search_path = public
as $$
  update user_alerts set enabled = false, updated_at = now() where unsubscribe_token = p_token returning email;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'get_user_alerts(uuid)', 'save_user_alerts(uuid,text,text[],text[],boolean)', 'get_digest_recipients()',
    'digest_tenders(text[],text[],timestamptz)', 'mark_digest_sent(uuid)', 'log_digest_run(int,int,int,int)', 'unsubscribe_alerts(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
