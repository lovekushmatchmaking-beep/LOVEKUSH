-- Aryan's privacy audit (2026-10-05): "Premium only" Company/College fields
-- were only hidden by CSS blur in the UI — profiles_public_view shipped the
-- real employer/college_name to every browser (DevTools-visible), so the
-- Premium upsell was bypassable and, more importantly, broke Aryan's core
-- privacy promise (no member should learn another member's accurate
-- employer/college name without going through the gate). Phone/email/full
-- address were verified NOT present in profiles_public_view already — only
-- employer + college_name needed fixing.
--
-- Fix: drop the two columns from the public view entirely, and add a
-- SECURITY DEFINER RPC that returns the real values only to: the profile's
-- own owner, staff, or a premium viewer — everyone else gets null values
-- plus a has_employer/has_college flag so the existing "Premium only" UI
-- placeholder still renders correctly without ever receiving real data.
--
-- Note: the live view had to be renamed out of the way and recreated
-- (Postgres can't DROP COLUMN via CREATE OR REPLACE VIEW); the old
-- definition is kept as profiles_public_view_old for reference/rollback
-- and is unused by the app.

alter view if exists public.profiles_public_view rename to profiles_public_view_old;

create view public.profiles_public_view as
select id,
    user_id,
    profile_code,
    mask_full_name(full_name) AS full_name,
    age,
    gender,
    city,
    state,
    religion,
    community,
    sub_caste,
    gotra,
    manglik,
    mother_tongue,
    education,
    diet,
    smoking,
    drinking,
    family_type,
    family_values,
    marital_status,
    height,
    weight,
    complexion,
    body_type,
    nationality,
    relocation_preference,
    annual_income,
    profile_completeness,
    profile_status,
    partner_age_min,
    partner_age_max,
    partner_religion,
    partner_location,
    partner_education,
    created_at,
    about_me,
    father_profession,
    mother_profession,
    brothers_count,
    brothers_married_count,
    sisters_count,
    sisters_married_count,
    family_city,
    kundli_available,
    partner_height_min,
    partner_height_max,
    partner_income_min,
    partner_income_max,
    partner_income_currency,
    partner_community_ids,
    partner_education_level_preferences,
    partner_city_preference,
    partner_state_preference,
    partner_country_preference,
    partner_notes,
    profile_for,
    verification_status,
    country,
    annual_income_currency,
    rashi,
    nakshatra,
    nakshatra_pada,
    mother_gotra,
    horoscope_match_required,
    residency_status
   from profiles
  where profile_status = 'active'::text and (hidden_until is null or hidden_until < now());

grant select on public.profiles_public_view to anon, authenticated;

-- get_match_candidates returns SETOF profiles_public_view, so it picks up
-- the narrower column set automatically — no change needed there.

create or replace function public.get_career_privacy_fields(p_profile_id uuid)
returns table(employer text, college_name text, has_employer boolean, has_college boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_employer text;
  v_college text;
  v_authorized boolean;
begin
  select p.employer, p.college_name into v_employer, v_college
  from profiles p where p.id = p_profile_id;

  if v_employer is null and v_college is null then
    return query select null::text, null::text, false, false;
    return;
  end if;

  v_authorized := exists (
    select 1 from profiles me
    where me.id = p_profile_id and me.user_id = auth.uid()
  ) or is_staff_member(auth.uid()) or exists (
    select 1 from profiles me where me.user_id = auth.uid() and me.is_premium = true
  );

  return query select
    case when v_authorized then v_employer else null end,
    case when v_authorized then v_college else null end,
    (v_employer is not null and v_employer <> ''),
    (v_college is not null and v_college <> '');
end;
$$;

grant execute on function public.get_career_privacy_fields(uuid) to anon, authenticated;
