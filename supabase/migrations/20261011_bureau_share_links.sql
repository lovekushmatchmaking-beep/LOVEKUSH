-- Share a CLIENT'S OWN profile with an external marriage bureau so they can
-- search their own database for a match (Aryan, 2026-10-11): "hamre client
-- ki profile kabhi kabhi dusre marriage bureau walo ko share karni padti
-- hai taki wo apne database se match dhoondh sake — contact details na
-- jaye, kuch manual notes (budget, requirements) likhne pad sakte hain, aur
-- agar unke paas match ho to humko wapas pata chale."
--
-- Reuse-first: this is the SAME share_links / get_shared_profile pipeline
-- already used to share a MATCH with a client (profile_id shown, contact
-- details never included, masked name, token-based no-login public page —
-- PR #45/#63 onward). Here profile_id is simply the client's own profile,
-- client_profile_id stays null (it isn't a match "for" anyone), and
-- is_bureau_share just switches the public page's footer from the client's
-- Interested/Not Interested buttons to a free-text "found a match?" reply
-- box for the bureau. No new table, no new page.
--
-- bureau_note: admin's manual, free-text note for THIS particular share
-- only (e.g. budget, a specific requirement) — separate from the profile's
-- own fields, shown on the public page so the bureau sees exactly what
-- Aryan wants them to know.
-- bureau_reply / bureau_replied_at: the bureau's free-text reply, written
-- back through the same no-login public page (mirrors
-- mark_share_link_interest's anon-write SECURITY DEFINER pattern below).
-- bureau_reply_acknowledged_at: admin has seen/actioned it (mirrors
-- interest_acknowledged_at / not_interest_acknowledged_at).

alter table public.share_links
  add column if not exists is_bureau_share boolean not null default false,
  add column if not exists bureau_note text,
  add column if not exists bureau_reply text,
  add column if not exists bureau_replied_at timestamptz,
  add column if not exists bureau_reply_acknowledged_at timestamptz;

create index if not exists share_links_pending_bureau_reply_idx
  on public.share_links (bureau_replied_at)
  where bureau_replied_at is not null and bureau_reply_acknowledged_at is null;

-- Bureau (no login, just the share link) sends back match details — same
-- anon-write SECURITY DEFINER pattern as mark_share_link_interest, scoped
-- strictly to the one token passed in and to actual bureau shares.
create or replace function public.submit_bureau_reply(p_token text, p_notes text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_notes text := nullif(btrim(p_notes), '');
  v_found boolean;
begin
  if v_notes is null then
    raise exception 'Please enter the match details.';
  end if;

  update public.share_links
    set bureau_reply = v_notes, bureau_replied_at = now()
    where token = p_token and is_bureau_share = true
      and coalesce(revoked, false) = false and expires_at > now()
  returning true into v_found;

  if not v_found then
    raise exception 'This share link is invalid, expired, or has been revoked.';
  end if;

  return true;
end;
$function$;

grant execute on function public.submit_bureau_reply(text, text) to anon, authenticated;

-- Notify the staff member who created the link — same AFTER UPDATE
-- trigger pattern as trg_notify_share_link_not_interested, firing only on
-- a genuinely new/changed reply so repeat saves don't spam the bell.
create or replace function public.trg_notify_bureau_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bureau_reply is not null
     and old.bureau_reply is distinct from new.bureau_reply
     and new.created_by is not null
  then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (new.created_by, 'bureau_share_reply',
      'A bureau replied on a shared profile: ' || new.bureau_reply, 'share_link', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_bureau_reply on public.share_links;
create trigger notify_on_bureau_reply
  after update on public.share_links
  for each row execute function public.trg_notify_bureau_reply();

-- get_shared_profile: add is_bureau_share / bureau_note / bureau_reply /
-- bureau_replied_at as new OUT columns — return type change, so drop is
-- required first, same as every earlier signature change to this function.
drop function if exists public.get_shared_profile(text);
create function public.get_shared_profile(p_token text)
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
  photo_path text, photo_path_2 text,
  is_bureau_share boolean, bureau_note text, bureau_reply text, bureau_replied_at timestamptz
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
    (select ph.storage_path from photos ph where ph.profile_id = p.id and ph.is_primary = false order by ph.display_order limit 1),
    v_link.is_bureau_share, v_link.bureau_note, v_link.bureau_reply, v_link.bureau_replied_at
  from profiles p
  where p.id = v_link.profile_id;
end;
$function$;

grant execute on function public.get_shared_profile(text) to anon, authenticated;
