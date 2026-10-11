-- Admin tools audit (Aryan, 2026-10-11): "Caste Suggestions" and
-- "Duplicate Leads" weren't working, plus a new "Marriage Bureau" lead source.
--
-- What the live DB (wgzoabobdfvxvyuczhdz) looked like before this:
--   * find_duplicate_leads() did NOT exist — 20261004_find_duplicate_leads_rpc
--     was never applied, so the Duplicate Leads screen's RPC call errored and
--     the screen silently showed "No duplicates found".
--   * caste_suggestions still had UNIQUE (religion, suggested_name) and
--     upsert_caste_suggestion() still did ON CONFLICT (religion, suggested_name)
--     — 20261004_caste_suggestion_uniqueness_field_type was never applied either.
--   * Approving a suggestion only flipped its status; nothing ever read the
--     approved rows back, so the value never showed up in any dropdown.
--
-- This migration is idempotent and supersedes both 20261004 files.

-- ===== 1. Field Suggestions (table keeps its old name caste_suggestions) =====

alter table public.caste_suggestions
  drop constraint if exists caste_suggestions_religion_suggested_name_key;
alter table public.caste_suggestions
  drop constraint if exists caste_suggestions_religion_suggested_name_field_type_key;

-- One row per (field, religion, name) — case-insensitive, and religion-less
-- fields (degree, mother tongue, professions) store religion = null, which a
-- plain UNIQUE would never treat as a conflict.
create unique index if not exists caste_suggestions_field_religion_name_uidx
  on public.caste_suggestions (field_type, (coalesce(religion, '')), (lower(btrim(suggested_name))));

create or replace function public.upsert_caste_suggestion(
  p_religion text,
  p_denomination text,
  p_suggested_name text,
  p_field_type text,
  p_submitted_by uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text := btrim(coalesce(p_suggested_name, ''));
begin
  if v_name = '' or coalesce(p_field_type, '') = '' then
    return;
  end if;
  insert into caste_suggestions (religion, denomination, suggested_name, field_type, submitted_by_profile_id)
  values (nullif(btrim(p_religion), ''), p_denomination, v_name, p_field_type, p_submitted_by)
  on conflict (field_type, (coalesce(religion, '')), (lower(btrim(suggested_name))))
  do update set times_suggested = caste_suggestions.times_suggested + 1, updated_at = now();
end;
$function$;

grant execute on function public.upsert_caste_suggestion(text, text, text, text, uuid) to anon, authenticated;

-- Approved suggestions become real dropdown options. Non-staff can't SELECT
-- caste_suggestions (RLS), so the signup / edit-profile forms read the
-- approved values through this instead — names only, no submitter info.
create or replace function public.get_approved_field_options()
returns table (field_type text, religion text, value text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.field_type, s.religion, s.suggested_name
  from caste_suggestions s
  where s.status = 'approved'
  order by s.suggested_name;
$$;

grant execute on function public.get_approved_field_options() to anon, authenticated;

-- Reviewed notification: "caste" read oddly for degree/profession suggestions.
create or replace function public.trg_notify_caste_suggestion_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' and new.submitted_by_profile_id is not null then
    perform public.notify_profile_owner(new.submitted_by_profile_id, 'caste_suggestion_reviewed',
      'Your suggested ' || replace(new.field_type, '_', ' ') || ' "' || new.suggested_name || '" was '
        || case when new.status = 'approved' then 'added to the list' else new.status end || '.',
      'caste_suggestion', new.id);
  end if;
  return new;
end;
$$;

-- ===== 2. Duplicate Leads =====
-- Same normalisation as src/utils/duplicateLeads.js normPhone(), so
-- "08376981829", "+91 83769 81829" and "8376981829" are one number.
create or replace function public.normalize_lead_phone(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '00%' then d := substr(d, 3); end if;
  if length(d) = 11 and d like '0%' then d := substr(d, 2); end if;
  if length(d) = 10 then d := '91' || d; end if;
  return nullif(d, '');
end;
$$;

-- Return-type change vs the 20261004 version needs a drop first.
drop function if exists public.find_duplicate_leads();

create or replace function public.find_duplicate_leads()
returns table (
  id uuid,
  full_name text,
  profile_code text,
  age int,
  city text,
  profile_status text,
  client_phone text,
  client_email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_staff_member(auth.uid()) then
    raise exception 'Only staff can view duplicate leads';
  end if;

  return query
    with keyed as (
      select p.id as pid,
             normalize_lead_phone(p.client_phone) as ph,
             nullif(lower(btrim(p.client_email)), '') as em
      from profiles p
    ),
    dup_phones as (select ph from keyed where ph is not null group by ph having count(*) > 1),
    dup_emails as (select em from keyed where em is not null group by em having count(*) > 1)
    select p.id, p.full_name, p.profile_code, p.age::int, p.city, p.profile_status,
           p.client_phone, p.client_email, p.created_at
    from profiles p
    join keyed k on k.pid = p.id
    where k.ph in (select ph from dup_phones) or k.em in (select em from dup_emails);
end;
$$;

grant execute on function public.find_duplicate_leads() to authenticated;

-- ===== 3. Lead source: Marriage Bureau =====
alter table public.profiles drop constraint if exists profiles_lead_source_check;
alter table public.profiles add constraint profiles_lead_source_check
  check (lead_source is null or lead_source in ('Referral', 'Online Ads', 'Walk-in', 'Website', 'Marriage Bureau', 'Other'));
