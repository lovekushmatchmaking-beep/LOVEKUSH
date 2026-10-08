-- Phase 3 (audit 2026-10-08, P0 #3): when both sides like each other, that
-- should read as "Mutual Interest", not two separate one-way notifications
-- for the admin to mentally stitch together — and definitely not a new
-- duplicate record. match_actions already has one row per direction
-- (actor_profile_id, target_profile_id) — this only changes what
-- Phase 2's trigger notifies when the *second* like completes a pair that
-- was already liked the other way.
--
-- No new table/column. Same notify_staff() helper. On a mutual match the
-- notification broadcasts to all active staff (not just one profile's RM)
-- since a mutual match usually spans two different clients who may have
-- two different RMs, and it's the kind of event either RM should be able
-- to act on first.

create or replace function public.trg_notify_match_action_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_name text;
  v_target_name text;
  v_target_staff uuid;
  v_verb text;
  v_is_mutual boolean;
begin
  if new.action not in ('like', 'super_like') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.action = new.action then
    return new;
  end if;

  select coalesce(full_name, profile_code, 'A member') into v_actor_name
    from public.profiles where id = new.actor_profile_id;
  select coalesce(full_name, profile_code, 'A profile'), managed_by_staff_id
    into v_target_name, v_target_staff
    from public.profiles where id = new.target_profile_id;

  select exists(
    select 1 from public.match_actions
    where actor_profile_id = new.target_profile_id
      and target_profile_id = new.actor_profile_id
      and action in ('like', 'super_like')
  ) into v_is_mutual;

  if v_is_mutual then
    -- The other side already liked this one back — this completes a
    -- mutual match. One upgraded notification, broadcast to all staff,
    -- instead of a second one-way "liked" notification stacking on the
    -- first (audit: "do not create unnecessary duplicate requests").
    perform public.notify_staff('mutual_interest',
      v_actor_name || ' and ' || v_target_name || ' have liked each other — mutual interest! Consider starting coordination.',
      'profile', new.target_profile_id, null);
  else
    v_verb := case when new.action = 'super_like' then 'super liked' else 'liked' end;
    perform public.notify_staff('profile_liked',
      v_actor_name || ' ' || v_verb || ' ' || v_target_name || '''s profile.',
      'profile', new.target_profile_id, v_target_staff);
  end if;

  return new;
end;
$$;
