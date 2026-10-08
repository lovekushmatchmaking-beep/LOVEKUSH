-- Phase 12 (audit 2026-10-08, P1 #12): a client opening a share link only
-- ever saw the suggested profile in isolation, with no sense it was
-- actually picked for them specifically — share_links.client_profile_id
-- (Model 2 links, 2026-10-06) already records who a link was generated
-- for, it just was never surfaced on the public page. The "contact us"
-- line was also a hardcoded company name rather than the actual staff
-- member (share_links.created_by) who generated the link.
--
-- Both RPCs return type changes (new output columns), which CREATE OR
-- REPLACE can't do in place — drop first, same as any other signature
-- change to a RETURNS TABLE function.

drop function if exists public.get_shared_profile(text);
create function public.get_shared_profile(p_token text)
returns table(
  profile_code text, masked_name text, age integer, gender text, city text, state text,
  religion text, community text, education text, occupation text, annual_income text,
  diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text
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
    (select u.email from auth.users u where u.id = v_link.created_by)
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

drop function if exists public.get_shared_bundle(text);
create function public.get_shared_bundle(p_token text)
returns table(token text, profile_code text, masked_name text, age integer, gender text,
  city text, state text, religion text, community text, education text, occupation text,
  annual_income text, diet text, complexion text, height text, expires_at timestamptz,
  client_masked_name text, client_age integer, client_city text, rm_email text)
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
    (select u.email from auth.users u where u.id = sl.created_by)
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  order by sl.created_at;
end;
$$;

grant execute on function public.get_shared_bundle(text) to anon, authenticated;
