-- Share links: (1) ek saath kai matches ek hi link mein ("bundle"), aur
-- (2) WhatsApp/Telegram link-preview card ke liye masked data.
--
-- Bundle = kai share_links rows jinka bundle_token same hai. Har row ka
-- apna expiry/revoke/view_count waise hi chalta hai jaise pehle — naya
-- table nahi, existing share_links hi reuse hota hai.

alter table public.share_links add column if not exists bundle_token text;
create index if not exists share_links_bundle_token_idx
  on public.share_links (bundle_token) where bundle_token is not null;

-- BUG FIX: get_shared_profile "p.occupation" padhta tha, lekin profiles
-- table mein aisa column hai hi nahi (asli column "profession" hai). Isse
-- har valid share link khulte hi "column p.occupation does not exist"
-- error deta tha. Return shape same rakha hai (occupation naam se), sirf
-- source column theek kiya.
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
    v_link.expires_at
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

-- Bundle link khulne par: bundle ke saare valid (expired/revoked nahi)
-- profiles, wahi masked fields jo get_shared_profile deta hai, plus har
-- profile ka apna single-share token (detail page ke liye).
create or replace function public.get_shared_bundle(p_token text)
returns table(token text, profile_code text, masked_name text, age integer, gender text,
  city text, state text, religion text, community text, education text, occupation text,
  annual_income text, diet text, complexion text, height text, expires_at timestamptz)
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
    p.annual_income, p.diet, p.complexion, p.height, sl.expires_at
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  order by sl.created_at;
end;
$$;

-- Link-preview bots (WhatsApp etc.) ke liye — view_count NAHI badhata
-- (warna har paste par count badh jaata), aur sirf card ke liye zaroori
-- masked fields deta hai. Photo kabhi nahi (photos request-gated hain).
-- p_token single link ka token ya bundle_token, dono chalte hain.
create or replace function public.get_share_preview(p_token text)
returns table(kind text, profile_count integer, masked_name text, age integer, gender text,
  city text, state text, religion text, community text, education text, occupation text, height text)
language sql stable security definer set search_path to 'public' as $$
  select 'profile', 1, public.mask_full_name(p.full_name), p.age, p.gender,
    p.city, p.state, p.religion, p.community, p.education, p.profession, p.height
  from share_links sl join profiles p on p.id = sl.profile_id
  where sl.token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
  union all
  select * from (
    select 'bundle', (count(*) over ())::integer, public.mask_full_name(p.full_name), p.age, p.gender,
      p.city, p.state, p.religion, p.community, p.education, p.profession, p.height
    from share_links sl join profiles p on p.id = sl.profile_id
    where sl.bundle_token = p_token and coalesce(sl.revoked, false) = false and sl.expires_at > now()
    order by sl.created_at
    limit 1
  ) b;
$$;

grant execute on function public.get_shared_bundle(text) to anon, authenticated;
grant execute on function public.get_share_preview(text) to anon, authenticated;
