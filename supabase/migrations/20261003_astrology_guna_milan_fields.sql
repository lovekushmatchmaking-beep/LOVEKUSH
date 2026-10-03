-- Astrology (Guna Milan) + India/NRI fields — sab additive, koi existing
-- column/data touch nahi hota.
--
-- * rashi / nakshatra / nakshatra_pada: Moon sign + birth star, Guna Milan
--   (src/utils/astrology.js) inhi pe chalta hai. Abhi user khud select
--   karta hai; kundli API connect hone par edge function `astrology-chart`
--   birth_date/time/place se inhe bharega (astro_source = 'api').
-- * astro_source / astro_updated_at / astro_api_payload: kis source se
--   values aayi aur vendor ka raw response (debug / re-scoring ke liye).
-- * mother_gotra: kai parivar maa ka gotra bhi avoid karte hain (warning).
-- * residency_status: India ke bahar rehne wale members ka visa/PR status.
--
-- birth_time / birth_place jaan-boojh kar view mein NAHI hain (private).
-- Purani khaali `astrology` table ko touch nahi kiya.

alter table public.profiles
  add column if not exists rashi text,
  add column if not exists nakshatra text,
  add column if not exists nakshatra_pada smallint,
  add column if not exists mother_gotra text,
  add column if not exists residency_status text,
  add column if not exists astro_source text,
  add column if not exists astro_updated_at timestamptz,
  add column if not exists astro_api_payload jsonb;

do $$ begin
  alter table public.profiles add constraint profiles_nakshatra_pada_check
    check (nakshatra_pada is null or nakshatra_pada between 1 and 4);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_astro_source_check
    check (astro_source is null or astro_source in ('self', 'api', 'admin'));
exception when duplicate_object then null; end $$;

create or replace view public.profiles_public_view as
 SELECT id,
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
    employer,
    college_name,
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
   FROM profiles
  WHERE profile_status = 'active'::text AND (hidden_until IS NULL OR hidden_until < now());
