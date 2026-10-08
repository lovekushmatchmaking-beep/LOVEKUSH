-- Phase 2 (audit 2026-10-08, P0 #2): one-way like must generate admin
-- visibility immediately, not only once it becomes a mutual like.
--
-- match_actions already records every like/super_like (Dashboard.js's
-- swipe actions) but nothing ever read it to notify anyone — reuses the
-- exact same notify_staff() helper and AFTER-trigger pattern as the
-- other 8 notification triggers in 20261005_in_app_notifications.sql.
-- No new table, no change to the existing like/dislike/super_like flow.
--
-- Per the audit, this does NOT get its own tab — it shows up through the
-- existing Notifications bell, deep-linking straight to the profile that
-- was liked (link_entity_type='profile'), same as a few other notification
-- types already do.

create or replace function public.trg_notify_match_action_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_name text;
  v_target_name text;
  v_target_staff uuid;
  v_verb text;
begin
  -- setMatchAction() upserts (onConflict actor+target) — only notify when
  -- this row is brand new, or an existing action genuinely changed to a
  -- like/super_like (e.g. dislike -> like), not on every repeat upsert of
  -- the same action. (tg_op checked before touching OLD, which plpgsql
  -- leaves unassigned on a plain INSERT.)
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

  v_verb := case when new.action = 'super_like' then 'super liked' else 'liked' end;

  perform public.notify_staff('profile_liked',
    v_actor_name || ' ' || v_verb || ' ' || v_target_name || '''s profile.',
    'profile', new.target_profile_id, v_target_staff);

  return new;
end;
$$;

drop trigger if exists notify_on_match_action on public.match_actions;
create trigger notify_on_match_action
  after insert or update of action on public.match_actions
  for each row execute function public.trg_notify_match_action_insert();
