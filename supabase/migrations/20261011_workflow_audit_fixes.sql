-- 2026-10-11 workflow audit fixes. Additive / CREATE OR REPLACE only, safe
-- to run more than once.

-- 1. Age keeps itself current.
-- profiles.age was saved on the day of signup/edit and went stale after
-- each birthday (audit: 47 of 137 profiles with a DOB showed the wrong age,
-- mostly 1 year too young) — Find Matches age filters, share-link pages,
-- admin lists and cards all read this column.
--   a) trigger: any insert/update that has a DOB stores the right age
--   b) refresh_profile_ages(): staff-only, the admin app calls it once on
--      open so birthdays since the last visit are picked up
--   c) one-time refresh now
CREATE OR REPLACE FUNCTION public.sync_profile_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.age := date_part('year', age(NEW.date_of_birth))::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_age ON public.profiles;
CREATE TRIGGER sync_profile_age
  BEFORE INSERT OR UPDATE OF date_of_birth, age ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_age();

CREATE OR REPLACE FUNCTION public.refresh_profile_ages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_users WHERE user_id = auth.uid()) THEN
    RETURN 0;
  END IF;
  UPDATE public.profiles
     SET age = date_part('year', age(date_of_birth))::int
   WHERE date_of_birth IS NOT NULL
     AND age IS DISTINCT FROM date_part('year', age(date_of_birth))::int;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_profile_ages() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_profile_ages() TO authenticated;

UPDATE public.profiles
   SET age = date_part('year', age(date_of_birth))::int
 WHERE date_of_birth IS NOT NULL
   AND age IS DISTINCT FROM date_part('year', age(date_of_birth))::int;

-- 2. "→ Tell this profile" (forward share-link interest) no longer errors
-- when the pair already has an open coordination request.
-- Since 20261010_allow_rerequests_after_close the pair is unique only while
-- the request is open, so forwarding after admin had already started
-- coordination (Find Matches "Start Coordination" / Schedule Meeting) hit
-- "duplicate key ... introductions_active_pair_unique". An open request in
-- either direction is now reused instead.
CREATE OR REPLACE FUNCTION public.forward_share_link_interest(p_link_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_link record;
  v_intro_id uuid;
begin
  select * into v_link from public.share_links
    where id = p_link_id and created_by = auth.uid();

  if v_link is null then
    raise exception 'Share link not found.';
  end if;
  if v_link.interested_at is null then
    raise exception 'This link has no interest to forward yet.';
  end if;
  if v_link.forwarded_at is not null then
    return v_link.forwarded_introduction_id;
  end if;

  if v_link.client_profile_id is not null then
    select i.id into v_intro_id from public.introductions i
      where ((i.from_profile = v_link.client_profile_id and i.to_profile = v_link.profile_id)
          or (i.from_profile = v_link.profile_id and i.to_profile = v_link.client_profile_id))
        and i.status not in ('closed', 'declined')
      order by i.created_at desc limit 1;

    if v_intro_id is null then
      insert into public.introductions (from_profile, to_profile, status, request_type, source)
      values (v_link.client_profile_id, v_link.profile_id, 'pending', 'meeting', 'share_link')
      returning id into v_intro_id;
    end if;
  else
    perform public.notify_profile_owner(v_link.profile_id, 'share_interest_forwarded',
      'Someone has shown interest in your profile through a shared match. Our team will be in touch about arranging a meeting.',
      'share_link', v_link.id);
  end if;

  update public.share_links
    set forwarded_at = now(), forwarded_introduction_id = v_intro_id
    where id = p_link_id;

  return v_intro_id;
end;
$function$;
