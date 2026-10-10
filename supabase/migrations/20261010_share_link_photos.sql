-- Aryan (2026-10-10): share link / biodata link ke andar member ki dono
-- saved photos (wahi already-compressed photos jo signup/EditPhotos ke
-- time save hoti hain) bhi dikhni chahiye, zoom karke dekhne layak.
--
-- Yeh purana privacy decision (share link par kabhi real photo nahi,
-- PR #63/#106) explicitly reverse karta hai — Aryan ne thread ke andar
-- decision card pe "Haan, dikhao" confirm kiya (2026-10-10).
--
-- Reuse-first: koi nayi photos table/column/upload pipeline nahi — wahi
-- `photos` table (is_primary=true -> profile photo, is_primary=false ->
-- secondary) aur wahi `lovekush-photos` storage bucket. Sirf:
--   1) get_shared_profile/get_shared_bundle ke return mein 2 naye columns
--      (photo_path, photo_path_2) jod diye (CREATE OR REPLACE se OUT
--      params end mein add karna allowed hai, type/order kisi purane
--      column ka nahi badla).
--   2) ek nayi storage.objects SELECT policy — jab bhi kisi profile ka
--      koi active (non-expired, non-revoked) share link maujood hai,
--      uski photos signed-URL ke liye readable ho jaati hain (anon samet
--      — share link bina login ke khulta hai). Token-specific nahi hai
--      (storage RLS token nahi jaanta), bas "is profile ka kisi link se
--      share hona" hi gate hai — jaisa baaki share-link data already hai.

create or replace function public.can_view_shared_photo(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    join share_links sl on sl.profile_id = ph.profile_id
    where ph.storage_path = p_name
      and coalesce(sl.revoked, false) = false
      and sl.expires_at > now()
  );
$$;

drop policy if exists "active share link viewer can view photos" on storage.objects;
create policy "active share link viewer can view photos" on storage.objects for select
  using (bucket_id = 'lovekush-photos' and public.can_view_shared_photo(name));

create or replace function public.get_shared_profile(p_token text)
returns table(
  profile_code text, masked_name text, age integer, gender text, city text, state text,
  religion text, community text, education text, occupation text, annual_income text,
  diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text,
  country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text,
  mother_tongue text, marital_status text, body_type text, nationality text, weight text,
  degree text, college_name text, employer text, family_type text, father_profession text,
  mother_profession text, family_financial_status text, about_me text,
  rm_name text, rm_phone text,
  full_name text, client_full_name text,
  photo_path text, photo_path_2 text
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
    (select coalesce(nullif(btrim(s.rm_email), ''), u.email::text)
       from auth.users u left join staff_users s on s.user_id = u.id
      where u.id = v_link.created_by),
    p.country, p.sub_caste, p.gotra, p.manglik, p.rashi, p.nakshatra,
    p.mother_tongue, p.marital_status, p.body_type, p.nationality, p.weight,
    p.degree, p.college_name, p.employer, p.family_type, p.father_profession,
    p.mother_profession, p.family_financial_status, public.share_safe_about_me(p.about_me),
    (select s.rm_name from staff_users s where s.user_id = v_link.created_by),
    (select s.rm_phone from staff_users s where s.user_id = v_link.created_by),
    p.full_name,
    (select c.full_name from profiles c where c.id = v_link.client_profile_id),
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = true order by ph.display_order limit 1),
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = false order by ph.display_order limit 1)
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

create or replace function public.get_shared_bundle(p_token text)
returns table(token text, profile_code text, masked_name text, age integer, gender text,
  city text, state text, religion text, community text, education text, occupation text,
  annual_income text, diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text,
  country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text,
  mother_tongue text, marital_status text, body_type text, nationality text, weight text,
  degree text, college_name text, employer text, family_type text, father_profession text,
  mother_profession text, family_financial_status text, about_me text,
  rm_name text, rm_phone text,
  full_name text, client_full_name text,
  photo_path text, photo_path_2 text)
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
    (select coalesce(nullif(btrim(s.rm_email), ''), u.email::text)
       from auth.users u left join staff_users s on s.user_id = u.id
      where u.id = sl.created_by),
    p.country, p.sub_caste, p.gotra, p.manglik, p.rashi, p.nakshatra,
    p.mother_tongue, p.marital_status, p.body_type, p.nationality, p.weight,
    p.degree, p.college_name, p.employer, p.family_type, p.father_profession,
    p.mother_profession, p.family_financial_status, public.share_safe_about_me(p.about_me),
    (select s.rm_name from staff_users s where s.user_id = sl.created_by),
    (select s.rm_phone from staff_users s where s.user_id = sl.created_by),
    p.full_name,
    (select c.full_name from profiles c where c.id = sl.client_profile_id),
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = true order by ph.display_order limit 1),
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = false order by ph.display_order limit 1)
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  order by sl.created_at;
end;
$$;
