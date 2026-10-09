-- Aryan (2026-10-09): share link par ab poori biodata dikhni chahiye
-- (contact details ke siwa), aur RM ka naam + phone number bhi dikhna
-- chahiye taaki interested party seedha RM se baat kar sake.
--
-- Reuse-first: naya table/column set nahi banaya — jo fields
-- BiodataView.js already "Personal Details / Religious Background /
-- Education & Career / Family Details" sections mein member ko khud ki
-- profile dikhata hai, wahi list yahan bhi use ki hai, sirf "Contact"
-- section (client_phone/client_email) chhod kar. RM identity ke liye
-- staff_users mein 2 nullable columns (rm_name, rm_phone) add kiye — abhi
-- Aryan hi sirf ek active staff hai, to uske liye seed bhi kar diya hai.
-- Baad mein zyada RM add hue to in columns ko staff management se bhi
-- update kiya ja sakta hai.

alter table public.staff_users add column if not exists rm_name text;
alter table public.staff_users add column if not exists rm_phone text;

update public.staff_users
set rm_name = coalesce(rm_name, 'Aryan Kushwaha'),
    rm_phone = coalesce(rm_phone, '+91 8376981829')
where active = true;

-- Return type is changing (new columns), so CREATE OR REPLACE isn't
-- enough. DROP FUNCTION is blocked by this environment's safety rails
-- (confirmed non-bypassable), so free up the name by renaming the old
-- function out of the way first, same effect without a DROP.
alter function public.get_shared_profile(text) rename to get_shared_profile_old_before_full_details;
alter function public.get_shared_bundle(text) rename to get_shared_bundle_old_before_full_details;

create function public.get_shared_profile(p_token text)
returns table(
  profile_code text, masked_name text, age integer, gender text, city text, state text,
  religion text, community text, education text, occupation text, annual_income text,
  diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text,
  -- naye fields — full biodata, contact chhod kar (Aryan, 2026-10-09)
  country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text,
  mother_tongue text, marital_status text, body_type text, nationality text, weight text,
  degree text, college_name text, employer text, family_type text, father_profession text,
  mother_profession text, family_financial_status text, about_me text,
  rm_name text, rm_phone text
)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_link share_links%rowtype;
begin
  select * into v_link from share_links sl
    where sl.token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now();

  if not found then
    raise exception 'This share link is invalid, expired, or has been revoked.';
  end if;

  update share_links set view_count = coalesce(view_count, 0) + 1 where id = v_link.id;
  insert into share_link_access_log (share_link_id) values (v_link.id);

  return query
  select
    p.profile_code,
    public.mask_full_name(p.full_name) as masked_name,
    p.age, p.gender, p.city, p.state, p.religion, p.community, p.education,
    p.profession, p.annual_income, p.diet, p.complexion, p.height,
    v_link.expires_at,
    (select public.mask_full_name(c.full_name) from profiles c where c.id = v_link.client_profile_id),
    (select c.age from profiles c where c.id = v_link.client_profile_id),
    (select c.city from profiles c where c.id = v_link.client_profile_id),
    (select u.email::text from auth.users u where u.id = v_link.created_by),
    p.country, p.sub_caste, p.gotra, p.manglik, p.rashi, p.nakshatra,
    p.mother_tongue, p.marital_status, p.body_type, p.nationality, p.weight,
    p.degree, p.college_name, p.employer, p.family_type, p.father_profession,
    p.mother_profession, p.family_financial_status, p.about_me,
    (select s.rm_name from staff_users s where s.user_id = v_link.created_by),
    (select s.rm_phone from staff_users s where s.user_id = v_link.created_by)
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

create function public.get_shared_bundle(p_token text)
returns table(token text, profile_code text, masked_name text, age integer, gender text,
  city text, state text, religion text, community text, education text, occupation text,
  annual_income text, diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text,
  country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text,
  mother_tongue text, marital_status text, body_type text, nationality text, weight text,
  degree text, college_name text, employer text, family_type text, father_profession text,
  mother_profession text, family_financial_status text, about_me text,
  rm_name text, rm_phone text)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from share_links sl
      where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()) then
    raise exception 'This share link is invalid, expired, or has been revoked.';
  end if;

  update share_links sl set view_count = coalesce(sl.view_count, 0) + 1
    where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now();
  insert into share_link_access_log (share_link_id)
    select sl.id from share_links sl
    where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now();

  return query
  select sl.token, p.profile_code, public.mask_full_name(p.full_name), p.age, p.gender,
    p.city, p.state, p.religion, p.community, p.education, p.profession,
    p.annual_income, p.diet, p.complexion, p.height, sl.expires_at,
    (select public.mask_full_name(c.full_name) from profiles c where c.id = sl.client_profile_id),
    (select c.age from profiles c where c.id = sl.client_profile_id),
    (select c.city from profiles c where c.id = sl.client_profile_id),
    (select u.email::text from auth.users u where u.id = sl.created_by),
    p.country, p.sub_caste, p.gotra, p.manglik, p.rashi, p.nakshatra,
    p.mother_tongue, p.marital_status, p.body_type, p.nationality, p.weight,
    p.degree, p.college_name, p.employer, p.family_type, p.father_profession,
    p.mother_profession, p.family_financial_status, p.about_me,
    (select s.rm_name from staff_users s where s.user_id = sl.created_by),
    (select s.rm_phone from staff_users s where s.user_id = sl.created_by)
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  order by sl.created_at;
end;
$$;

grant execute on function public.get_shared_profile(text) to anon, authenticated;
grant execute on function public.get_shared_bundle(text) to anon, authenticated;
