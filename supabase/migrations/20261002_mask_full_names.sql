-- Name privacy — dusre members (aur share links) ko kabhi poora naam nahi
-- dikhta: "Aryan Kushwaha" → "A. Kushwaha" (ek hi word ho to "A.").
-- Staff (Admin panel) aur member khud apna poora naam dekhte hain, kyunki
-- woh profiles table se padhte hain, is view se nahi.

create or replace function public.mask_full_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p_name), '') = '' then null
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1
      then upper(left(btrim(p_name), 1)) || '.'
    else upper(left(btrim(p_name), 1)) || '. ' ||
      (regexp_split_to_array(btrim(p_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)]
  end;
$$;

-- Same columns, same order — sirf full_name ab masked aata hai.
create or replace view public.profiles_public_view as
 SELECT id, user_id, profile_code,
    public.mask_full_name(full_name) as full_name,
    age, gender, city, state, religion, community, sub_caste, gotra, manglik,
    mother_tongue, education, diet, smoking, drinking, family_type, family_values,
    marital_status, height, weight, complexion, body_type, nationality,
    relocation_preference, annual_income, profile_completeness, profile_status,
    partner_age_min, partner_age_max, partner_religion, partner_location,
    partner_education, created_at, about_me, employer, college_name,
    father_profession, mother_profession, brothers_count, brothers_married_count,
    sisters_count, sisters_married_count, family_city, kundli_available,
    partner_height_min, partner_height_max, partner_income_min, partner_income_max,
    partner_income_currency, partner_community_ids, partner_education_level_preferences,
    partner_city_preference, partner_state_preference, partner_country_preference,
    partner_notes, profile_for, verification_status
   FROM profiles
  WHERE profile_status = 'active'::text AND (hidden_until IS NULL OR hidden_until < now());

-- Share link ka masked_name bhi isi format pe ("Aryan K." → "A. Kushwaha").
CREATE OR REPLACE FUNCTION public.get_shared_profile(p_token text)
 RETURNS TABLE(profile_code text, masked_name text, age integer, gender text, city text, state text, religion text, community text, education text, occupation text, annual_income text, diet text, complexion text, height text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link share_links%rowtype;
begin
  select * into v_link from share_links sl
    where sl.token = p_token and sl.revoked = false and sl.expires_at > now();

  if not found then
    raise exception 'This share link is invalid, expired, or has been revoked.';
  end if;

  update share_links set view_count = view_count + 1 where id = v_link.id;
  insert into share_link_access_log (share_link_id) values (v_link.id);

  return query
  select
    p.profile_code,
    public.mask_full_name(p.full_name) as masked_name,
    p.age, p.gender, p.city, p.state, p.religion, p.community, p.education,
    p.occupation, p.annual_income, p.diet, p.complexion, p.height,
    v_link.expires_at
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;
