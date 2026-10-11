-- Shared links / profile cards: show only the STATE, never the town or
-- locality (Aryan, 2026-10-11): "Rani Bagh" jaisi choti jagah dikhne se
-- doosre bureau seedha family tak pahunch jaate the. Indian profiles now
-- show only their state ("Delhi", "Haryana"); profiles abroad show only
-- the country. Admin's own screens (profiles table, RLS-gated) are
-- untouched and keep the full city.
--
-- Mirrors src/utils/shareRegion.js — keep the two place lists in sync.
-- Every public RPC keeps its exact return type (so CREATE OR REPLACE, no
-- drop): `city` / `client_city` columns stay but carry no town any more.
--
-- Also fixes list_staff_with_email(): auth.users.email is varchar but the
-- function declares text, so every call failed with "structure of query
-- does not match function result type" — that is why My Queue showed
-- "No active staff found" and Manage Staff / RM performance stayed empty.

create or replace function public.share_region_lookup(p_text text)
returns text language sql immutable set search_path to 'public' as $$
  select v.region from (values
      ('andhra pradesh', 'Andhra Pradesh'),
      ('arunachal pradesh', 'Arunachal Pradesh'),
      ('assam', 'Assam'),
      ('bihar', 'Bihar'),
      ('chhattisgarh', 'Chhattisgarh'),
      ('goa', 'Goa'),
      ('gujarat', 'Gujarat'),
      ('haryana', 'Haryana'),
      ('himachal pradesh', 'Himachal Pradesh'),
      ('jharkhand', 'Jharkhand'),
      ('karnataka', 'Karnataka'),
      ('kerala', 'Kerala'),
      ('madhya pradesh', 'Madhya Pradesh'),
      ('maharashtra', 'Maharashtra'),
      ('manipur', 'Manipur'),
      ('meghalaya', 'Meghalaya'),
      ('mizoram', 'Mizoram'),
      ('nagaland', 'Nagaland'),
      ('odisha', 'Odisha'),
      ('punjab', 'Punjab'),
      ('rajasthan', 'Rajasthan'),
      ('sikkim', 'Sikkim'),
      ('tamil nadu', 'Tamil Nadu'),
      ('telangana', 'Telangana'),
      ('tripura', 'Tripura'),
      ('uttar pradesh', 'Uttar Pradesh'),
      ('uttarakhand', 'Uttarakhand'),
      ('west bengal', 'West Bengal'),
      ('andaman and nicobar islands', 'Andaman and Nicobar Islands'),
      ('chandigarh', 'Chandigarh'),
      ('dadra and nagar haveli and daman and diu', 'Dadra and Nagar Haveli and Daman and Diu'),
      ('delhi', 'Delhi'),
      ('jammu and kashmir', 'Jammu and Kashmir'),
      ('ladakh', 'Ladakh'),
      ('lakshadweep', 'Lakshadweep'),
      ('puducherry', 'Puducherry'),
      ('new delhi', 'Delhi'),
      ('nct delhi', 'Delhi'),
      ('delhi ncr', 'Delhi'),
      ('ncr', 'Delhi'),
      ('up', 'Uttar Pradesh'),
      ('u.p.', 'Uttar Pradesh'),
      ('u.p', 'Uttar Pradesh'),
      ('mp', 'Madhya Pradesh'),
      ('m.p.', 'Madhya Pradesh'),
      ('orissa', 'Odisha'),
      ('uttaranchal', 'Uttarakhand'),
      ('pondicherry', 'Puducherry'),
      ('j&k', 'Jammu and Kashmir'),
      ('jammu & kashmir', 'Jammu and Kashmir'),
      ('hp', 'Himachal Pradesh'),
      ('wb', 'West Bengal'),
      ('tamilnadu', 'Tamil Nadu'),
      ('chattisgarh', 'Chhattisgarh'),
      ('delhi', 'Delhi'),
      ('rani bagh', 'Delhi'),
      ('ranibagh', 'Delhi'),
      ('pitampura', 'Delhi'),
      ('pitam pura', 'Delhi'),
      ('shalimar bagh', 'Delhi'),
      ('uttam nagar', 'Delhi'),
      ('shakurpur', 'Delhi'),
      ('shakur pur', 'Delhi'),
      ('shakurpur village', 'Delhi'),
      ('dilshad garden', 'Delhi'),
      ('new ashok nagar', 'Delhi'),
      ('rohini', 'Delhi'),
      ('dwarka', 'Delhi'),
      ('janakpuri', 'Delhi'),
      ('laxmi nagar', 'Delhi'),
      ('mayur vihar', 'Delhi'),
      ('karol bagh', 'Delhi'),
      ('saket', 'Delhi'),
      ('narela', 'Delhi'),
      ('najafgarh', 'Delhi'),
      ('agra', 'Uttar Pradesh'),
      ('achnera', 'Uttar Pradesh'),
      ('allahabad', 'Uttar Pradesh'),
      ('prayagraj', 'Uttar Pradesh'),
      ('ayodhya', 'Uttar Pradesh'),
      ('azamgarh', 'Uttar Pradesh'),
      ('bareilly', 'Uttar Pradesh'),
      ('firozabad', 'Uttar Pradesh'),
      ('noida', 'Uttar Pradesh'),
      ('greater noida', 'Uttar Pradesh'),
      ('ghaziabad', 'Uttar Pradesh'),
      ('sambhal', 'Uttar Pradesh'),
      ('chhapraula', 'Uttar Pradesh'),
      ('lucknow', 'Uttar Pradesh'),
      ('kanpur', 'Uttar Pradesh'),
      ('varanasi', 'Uttar Pradesh'),
      ('meerut', 'Uttar Pradesh'),
      ('mathura', 'Uttar Pradesh'),
      ('aligarh', 'Uttar Pradesh'),
      ('moradabad', 'Uttar Pradesh'),
      ('gorakhpur', 'Uttar Pradesh'),
      ('jhansi', 'Uttar Pradesh'),
      ('etawah', 'Uttar Pradesh'),
      ('mainpuri', 'Uttar Pradesh'),
      ('hapur', 'Uttar Pradesh'),
      ('bulandshahr', 'Uttar Pradesh'),
      ('saharanpur', 'Uttar Pradesh'),
      ('muzaffarnagar', 'Uttar Pradesh'),
      ('gurugram', 'Haryana'),
      ('gurgaon', 'Haryana'),
      ('faridabad', 'Haryana'),
      ('old faridabad', 'Haryana'),
      ('karnal', 'Haryana'),
      ('sonipat', 'Haryana'),
      ('sonepat', 'Haryana'),
      ('panipat', 'Haryana'),
      ('rohtak', 'Haryana'),
      ('hisar', 'Haryana'),
      ('ambala', 'Haryana'),
      ('rewari', 'Haryana'),
      ('bahadurgarh', 'Haryana'),
      ('palwal', 'Haryana'),
      ('jhajjar', 'Haryana'),
      ('jaipur', 'Rajasthan'),
      ('jodhpur', 'Rajasthan'),
      ('udaipur', 'Rajasthan'),
      ('kota', 'Rajasthan'),
      ('ajmer', 'Rajasthan'),
      ('alwar', 'Rajasthan'),
      ('bikaner', 'Rajasthan'),
      ('behror', 'Rajasthan'),
      ('kotputli', 'Rajasthan'),
      ('katputli behror', 'Rajasthan'),
      ('kotputli behror', 'Rajasthan'),
      ('bharatpur', 'Rajasthan'),
      ('ludhiana', 'Punjab'),
      ('amritsar', 'Punjab'),
      ('jalandhar', 'Punjab'),
      ('patiala', 'Punjab'),
      ('mohali', 'Punjab'),
      ('mumbai', 'Maharashtra'),
      ('pune', 'Maharashtra'),
      ('nagpur', 'Maharashtra'),
      ('nashik', 'Maharashtra'),
      ('thane', 'Maharashtra'),
      ('bengaluru', 'Karnataka'),
      ('bangalore', 'Karnataka'),
      ('mysore', 'Karnataka'),
      ('mysuru', 'Karnataka'),
      ('chennai', 'Tamil Nadu'),
      ('coimbatore', 'Tamil Nadu'),
      ('hyderabad', 'Telangana'),
      ('kolkata', 'West Bengal'),
      ('ahmedabad', 'Gujarat'),
      ('surat', 'Gujarat'),
      ('vadodara', 'Gujarat'),
      ('rajkot', 'Gujarat'),
      ('bhopal', 'Madhya Pradesh'),
      ('indore', 'Madhya Pradesh'),
      ('gwalior', 'Madhya Pradesh'),
      ('jabalpur', 'Madhya Pradesh'),
      ('patna', 'Bihar'),
      ('gaya', 'Bihar'),
      ('dehradun', 'Uttarakhand'),
      ('haridwar', 'Uttarakhand'),
      ('rishikesh', 'Uttarakhand'),
      ('shimla', 'Himachal Pradesh'),
      ('srinagar', 'Jammu and Kashmir'),
      ('jammu', 'Jammu and Kashmir'),
      ('ranchi', 'Jharkhand'),
      ('raipur', 'Chhattisgarh'),
      ('bhubaneswar', 'Odisha'),
      ('guwahati', 'Assam'),
      ('kochi', 'Kerala'),
      ('thiruvananthapuram', 'Kerala'),
      ('visakhapatnam', 'Andhra Pradesh'),
      ('vijayawada', 'Andhra Pradesh')
  ) as v(place, region)
  where v.place = p_text
  limit 1
$$;

create or replace function public.share_region_from_text(p_text text)
returns text language plpgsql immutable set search_path to 'public' as $$
declare
  t text := lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
  part text;
  hit text;
  st text;
begin
  if t = '' then return null; end if;
  hit := public.share_region_lookup(t);
  if hit is not null then return hit; end if;
  for part in
    select btrim(x) from regexp_split_to_table(t, '[,/|()\-–]|[0-9]+') with ordinality as s(x, n)
    where btrim(x) <> '' order by n
  loop
    hit := public.share_region_lookup(part);
    if hit is not null then return hit; end if;
  end loop;
  -- A state name buried in free text ("Dilshad Garden Delhi")
  foreach st in array array['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
    'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
    'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
    'Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry']
  loop
    if t ~ ('\m' || lower(st) || '\M') then return st; end if;
  end loop;
  return null;
end;
$$;

-- What a shared/external view may show for location.
create or replace function public.share_region(p_city text, p_state text, p_country text)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when nullif(btrim(coalesce(p_country, '')), '') is not null and p_country !~* 'india' then btrim(p_country)
    else coalesce(public.share_region_from_text(p_state), public.share_region_from_text(p_city))
  end
$$;

grant execute on function public.share_region(text, text, text) to anon, authenticated;

-- ===== Public share RPCs: same signatures/return types as live, only the
-- location columns change (city → null, state → share_region, client_city
-- → share_region of the client).

create or replace function public.get_share_preview(p_token text)
returns table(kind text, profile_count integer, masked_name text, age integer, gender text, city text, state text, religion text, community text, education text, occupation text, height text)
language sql stable security definer set search_path to 'public' as $function$
  select 'profile', 1, public.mask_full_name(p.full_name), p.age, p.gender,
    null::text, public.share_region(p.city, p.state, p.country), p.religion, p.community, p.education, p.profession, p.height
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  union all
  select * from (
    select 'bundle', (count(*) over ())::integer, public.mask_full_name(p.full_name), p.age, p.gender,
      null::text, public.share_region(p.city, p.state, p.country), p.religion, p.community, p.education, p.profession, p.height
    from share_links sl join profiles p on p.id = sl.profile_id
    where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
    order by sl.created_at
    limit 1
  ) b;
$function$;

create or replace function public.get_shared_bundle(p_token text)
returns table(token text, profile_code text, masked_name text, age integer, gender text, city text, state text, religion text, community text, education text, occupation text, annual_income text, diet text, complexion text, height text, expires_at timestamp with time zone, client_masked_name text, client_age integer, client_city text, rm_email text, country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text, mother_tongue text, marital_status text, body_type text, nationality text, weight text, degree text, college_name text, employer text, family_type text, father_profession text, mother_profession text, family_financial_status text, about_me text, rm_name text, rm_phone text, full_name text, client_full_name text, photo_path text, photo_path_2 text)
language plpgsql security definer set search_path to 'public' as $function$
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
    null::text, public.share_region(p.city, p.state, p.country), p.religion, p.community, p.education, p.profession,
    p.annual_income, p.diet, p.complexion, p.height, sl.expires_at,
    (select public.mask_full_name(c.full_name) from profiles c where c.id = sl.client_profile_id),
    (select c.age from profiles c where c.id = sl.client_profile_id),
    (select public.share_region(c.city, c.state, c.country) from profiles c where c.id = sl.client_profile_id),
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
$function$;

create or replace function public.get_shared_profile(p_token text)
returns table(profile_code text, masked_name text, age integer, gender text, city text, state text, religion text, community text, education text, occupation text, annual_income text, diet text, complexion text, height text, expires_at timestamp with time zone, client_masked_name text, client_age integer, client_city text, rm_email text, country text, sub_caste text, gotra text, manglik text, rashi text, nakshatra text, mother_tongue text, marital_status text, body_type text, nationality text, weight text, degree text, college_name text, employer text, family_type text, father_profession text, mother_profession text, family_financial_status text, about_me text, rm_name text, rm_phone text, full_name text, client_full_name text, photo_path text, photo_path_2 text, is_bureau_share boolean, bureau_note text, bureau_reply text, bureau_replied_at timestamp with time zone)
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
    p.age, p.gender, null::text, public.share_region(p.city, p.state, p.country), p.religion, p.community, p.education,
    p.profession, p.annual_income, p.diet, p.complexion, p.height,
    v_link.expires_at,
    (select public.mask_full_name(c.full_name) from profiles c where c.id = v_link.client_profile_id),
    (select c.age from profiles c where c.id = v_link.client_profile_id),
    (select public.share_region(c.city, c.state, c.country) from profiles c where c.id = v_link.client_profile_id),
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
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = false order by ph.display_order limit 1),
    v_link.is_bureau_share, v_link.bureau_note, v_link.bureau_reply, v_link.bureau_replied_at
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

-- Old renamed copies left behind by earlier migrations. The two
-- *_old_before_full_details ones were STILL executable by anon (checked
-- live 2026-10-11), i.e. anyone with a share token could call them and get
-- the raw city back, bypassing this fix and earlier privacy fixes. Lock all four.
revoke execute on function public.get_shared_profile_old_before_full_name(text) from public, anon, authenticated;
revoke execute on function public.get_shared_bundle_old_before_full_name(text) from public, anon, authenticated;
revoke execute on function public.get_shared_profile_old_before_full_details(text) from public, anon, authenticated;
revoke execute on function public.get_shared_bundle_old_before_full_details(text) from public, anon, authenticated;

-- ===== list_staff_with_email: email varchar → text cast (see header).
create or replace function public.list_staff_with_email()
returns table(id uuid, user_id uuid, email text, role text, active boolean, created_at timestamp with time zone)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not is_staff_admin(auth.uid()) then
    raise exception 'Only an admin can view the staff list';
  end if;
  return query
    select s.id, s.user_id, u.email::text, s.role, s.active, s.created_at
    from staff_users s
    join auth.users u on u.id = s.user_id
    order by s.created_at asc;
end;
$function$;

-- ===== share_links: staff may update any link (audit 2026-10-11). Only the
-- creator could update before, so "Mark as noted" / "Noted" on a link made
-- by another staff member matched 0 rows without an error, and its
-- Dashboard badge could never be cleared.
drop policy if exists "staff can update share links" on public.share_links;
create policy "staff can update share links" on public.share_links
  for update using (public.is_staff_member(auth.uid())) with check (public.is_staff_member(auth.uid()));
