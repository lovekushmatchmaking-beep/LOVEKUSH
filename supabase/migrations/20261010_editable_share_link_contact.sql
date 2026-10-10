-- Aryan (2026-10-10): share link par RM ka naam, phone aur email dikhta
-- hai. Woh chahte hain ki teeno ek chhote edit screen se badal sakein —
-- naya number/email lein ya kisi aur ko appoint karein to share link par
-- wahi naya contact jaaye.
--
-- Reuse-first: staff_users mein rm_name + rm_phone pehle se hain
-- (20261009_share_link_full_details_rm_contact). Sirf ek nullable rm_email
-- column add kiya. get_shared_profile/get_shared_bundle ka return type
-- same hai — sirf rm_email ab staff_users.rm_email se aata hai (khaali ho
-- to pehle jaisa login email). Share links contact view ke time padhte
-- hain, isliye edit karte hi purane aur naye dono links par naya contact
-- dikhta hai.
--
-- staff_users par RM ke liye khud ki row update karne ki policy nahi hai
-- (aur dena bhi nahi chahiye — warna woh apna role badal sake). Isliye
-- set_share_contact() SECURITY DEFINER RPC sirf in 3 columns ko update
-- karta hai: khud ki row, ya admin ho to kisi bhi staff ki.

alter table public.staff_users add column if not exists rm_email text;

create or replace function public.set_share_contact(
  p_name text, p_phone text, p_email text, p_target_user_id uuid default null)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_target uuid := coalesce(p_target_user_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if v_target <> auth.uid() and not public.is_staff_admin(auth.uid()) then
    raise exception 'Only an admin can change another staff member''s share-link contact.';
  end if;
  if nullif(btrim(p_email), '') is not null
     and btrim(p_email) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Please enter a valid email address.';
  end if;

  update staff_users
     set rm_name = nullif(btrim(p_name), ''),
         rm_phone = nullif(btrim(p_phone), ''),
         rm_email = nullif(btrim(p_email), ''),
         updated_at = now()
   where user_id = v_target;

  if not found then
    raise exception 'Staff account not found.';
  end if;
end;
$fn$;

revoke execute on function public.set_share_contact(text, text, text, uuid) from public, anon;
grant execute on function public.set_share_contact(text, text, text, uuid) to authenticated;

create or replace function public.get_shared_profile(p_token text)
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
  rm_name text, rm_phone text,
  full_name text, client_full_name text
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
    -- Share-link contact screen (2026-10-10): staff_users.rm_email set ho to
    -- wahi, warna pehle jaisa login email.
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
    (select c.full_name from profiles c where c.id = v_link.client_profile_id)
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
  full_name text, client_full_name text)
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
    (select c.full_name from profiles c where c.id = sl.client_profile_id)
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  order by sl.created_at;
end;
$$;
