-- GoBid step 4: email notifications and the contact form.
-- Run after 003_user_alerts.sql (Supabase → SQL Editor → paste → Run). Safe to run again.
--   email_log         one row per email that must only ever go out once (welcome, each
--                     closing-soon reminder), so retries and repeat visits never double-send
--   contact_messages  messages from the site's contact form, saved before any email is sent

create table if not exists public.email_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null check (kind in ('welcome', 'closing_soon')),
  ref      text not null default '',          -- the bid number for a closing-soon reminder
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.email_log enable row level security;

create table if not exists public.contact_messages (
  id               bigserial primary key,
  name             text not null,
  email            text not null,
  company          text,
  message          text not null,
  ip_hash          text,
  auto_replied_at  timestamptz,
  notified_at      timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
create index if not exists contact_messages_ip_recent on public.contact_messages (ip_hash, created_at desc);
create index if not exists contact_messages_email_recent on public.contact_messages (lower(email), created_at desc);

-- Claims a one-time email. True the first time (send it now), false if it was already claimed.
create or replace function public.claim_email(p_user_id uuid, p_kind text, p_ref text default '')
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  insert into email_log (user_id, kind, ref) values (p_user_id, p_kind, coalesce(p_ref, ''));
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Gives a claim back when sending failed, so the next try can send it.
create or replace function public.release_email(p_user_id uuid, p_kind text, p_ref text default '')
returns void
language sql security definer set search_path = public
as $$
  delete from email_log where user_id = p_user_id and kind = p_kind and ref = coalesce(p_ref, '');
$$;

-- Records closing-soon reminders that went out in a digest.
create or replace function public.mark_reminders_sent(p_user_id uuid, p_bids text[])
returns void
language sql security definer set search_path = public
as $$
  insert into email_log (user_id, kind, ref)
  select p_user_id, 'closing_soon', b from unnest(coalesce(p_bids, '{}')) as b
  on conflict do nothing;
$$;

-- Like digest_tenders(), but each closing-soon bid is reminded only once per user.
create or replace function public.digest_tenders_for(p_user_id uuid, p_categories text[], p_keywords text[], p_since timestamptz)
returns table (section text, bid_number text, bid_kind text, items text, ministry text, department text,
               quantity numeric, ends_at timestamptz, document_url text, matched_keywords text[])
language sql stable security definer set search_path = public
as $$
  select d.* from digest_tenders(p_categories, p_keywords, p_since) d
  where d.section <> 'closing_soon'
     or not exists (select 1 from email_log l
                    where l.user_id = p_user_id and l.kind = 'closing_soon' and l.ref = d.bid_number);
$$;

-- Saves a contact-form message, unless the same sender (IP or email) already sent 3 in the
-- last hour. Returns the new id, or null when rate-limited.
create or replace function public.save_contact_message(p_name text, p_email text, p_company text, p_message text, p_ip_hash text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare new_id bigint;
begin
  if (select count(*) from contact_messages
      where created_at > now() - interval '1 hour'
        and ((p_ip_hash is not null and ip_hash = p_ip_hash) or lower(email) = lower(p_email))) >= 3 then
    return null;
  end if;
  insert into contact_messages (name, email, company, message, ip_hash)
  values (p_name, p_email, nullif(p_company, ''), p_message, p_ip_hash)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.mark_contact_emailed(p_id bigint, p_auto_replied boolean, p_notified boolean)
returns void
language sql security definer set search_path = public
as $$
  update contact_messages set
    auto_replied_at = case when p_auto_replied then now() else auto_replied_at end,
    notified_at = case when p_notified then now() else notified_at end
  where id = p_id;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'claim_email(uuid,text,text)', 'release_email(uuid,text,text)', 'mark_reminders_sent(uuid,text[])',
    'digest_tenders_for(uuid,text[],text[],timestamptz)', 'save_contact_message(text,text,text,text,text)',
    'mark_contact_emailed(bigint,boolean,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
