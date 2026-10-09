-- Aryan (2026-10-09, screenshots): share link par sabse upar ek raw text
-- block dikh raha tha — "Source sheet ID: MB00122 | Raw unclassified data
-- ... | WhatsApp: 99xxxxxxxx". Yeh client-import ka internal note hai jo
-- 131 imported profiles ke about_me mein pada hai, aur usme contact number
-- bhi leak ho raha tha. Saath hi Aryan chahte hain ki share link par poora
-- naam dikhe (contact details ke siwa sab kuch).
--
-- Reuse-first: profiles.about_me ko chhua nahi (admin ko raw note ab bhi
-- dikhta hai). Sirf share-link RPCs ab about_me ko share_safe_about_me()
-- se nikaalte hain: import-dump wala note poora hata deta hai, aur kisi
-- bhi normal "About Me" mein se phone number / email nikaal deta hai.
-- full_name + client_full_name columns end mein add kiye (masked_name
-- waisa hi hai, purana frontend bhi chalta rahe).
--
-- WhatsApp "interest_received" event: jab ek party share link par
-- Interested dabaye, admin doosri party ko template ke saath us interested
-- profile ka link bhej sake — existing whatsapp_templates/notification_log
-- system mein ek naya category.

create or replace function public.share_safe_about_me(p_text text)
returns text language sql immutable as $fn$
  select case
    when p_text is null then null
    when p_text ~* '(source sheet id|raw unclassified)' then null
    else nullif(btrim(regexp_replace(regexp_replace(p_text,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '', 'g'),
      '(\m(whats\s?app|mobile|mob|phone|ph|contact|call)\M(\s*(no|number)\.?)?\s*[:\-]?\s*)?\+?(\d[\s-]?){9,}\d', '', 'gi')), '')
  end
$fn$;

alter table public.whatsapp_templates drop constraint if exists whatsapp_templates_category_check;
alter table public.whatsapp_templates add constraint whatsapp_templates_category_check
  check (category = any (array['selfie_requested','profile_approved','match_shared','meeting_scheduled','interest_received','general']));
alter table public.notification_log drop constraint if exists notification_log_event_type_check;
alter table public.notification_log add constraint notification_log_event_type_check
  check (event_type = any (array['selfie_requested','profile_approved','match_shared','meeting_scheduled','interest_received','general']));

-- Return type badal raha hai (2 naye columns) — DROP FUNCTION is
-- environment mein blocked hai, isliye pehle wala naam rename karke free
-- karte hain (same pattern as 20261009_share_link_full_details_rm_contact).
alter function public.get_shared_profile(text) rename to get_shared_profile_old_before_full_name;
alter function public.get_shared_bundle(text) rename to get_shared_bundle_old_before_full_name;

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
    (select u.email::text from auth.users u where u.id = v_link.created_by),
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

create function public.get_shared_bundle(p_token text)
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
    (select u.email::text from auth.users u where u.id = sl.created_by),
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

grant execute on function public.get_shared_profile(text) to anon, authenticated;
grant execute on function public.get_shared_bundle(text) to anon, authenticated;

-- Purane (renamed) versions ab bhi raw about_me lautate hain — inhe public
-- se band kar do taaki token wala koi bhi unhe seedha call na kar sake.
revoke execute on function public.get_shared_profile_old_before_full_name(text) from public, anon, authenticated;
revoke execute on function public.get_shared_bundle_old_before_full_name(text) from public, anon, authenticated;
