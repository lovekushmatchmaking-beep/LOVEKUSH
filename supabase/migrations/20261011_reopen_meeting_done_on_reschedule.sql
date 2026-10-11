-- Coordination/meeting workflow audit, round 3 (Aryan, 2026-10-11): a pair
-- whose meeting was marked "Met" (status = 'meeting_done') but has no
-- decision recorded yet could get a brand-new future meeting time fixed
-- for them (via the "Schedule a meeting" panel, which reuses any non-closed
-- request for the pair) while the badge kept reading "Meeting done" — a
-- meeting that's actually still in the future showing as already complete,
-- with the old 48h decision countdown (now meaningless) still running.
--
-- Fix: when admin_schedule_meeting sets a new time on such a row, it now
-- also reopens the status back to 'accepted' and clears the stale
-- decision_deadline — same "status reflects reality" rule the function
-- already applies to pending/declined. Only when decision is still null:
-- if a decision was already recorded (interested/not_interested) the
-- pipeline has moved on and this leaves status exactly as it was, so the
-- next-round history/badges for that case are untouched.
--
-- Additive, CREATE OR REPLACE only — safe to run more than once.
create or replace function public.admin_schedule_meeting(
  p_client uuid,
  p_others uuid[],
  p_scheduled_at timestamptz,
  p_location text default null,
  p_meeting_mode text default 'in_person'
)
returns table (introduction_id uuid, other_profile uuid, request_id text, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_other uuid;
  v_row public.introductions%rowtype;
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_mode text := case when p_meeting_mode = 'virtual' then 'virtual' else 'in_person' end;
  v_when text := to_char(p_scheduled_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
begin
  if not exists (select 1 from public.staff_users where user_id = auth.uid()) then
    raise exception 'Only staff can schedule meetings';
  end if;
  if p_client is null or coalesce(array_length(p_others, 1), 0) = 0 then
    raise exception 'Pick the client and at least one profile to meet';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '1 minute' then
    raise exception 'Meeting time cannot be in the past';
  end if;

  foreach v_other in array p_others loop
    if v_other = p_client then
      raise exception 'A profile cannot have a meeting with itself';
    end if;

    select * into v_row from public.introductions i
      where ((i.from_profile = p_client and i.to_profile = v_other)
          or (i.from_profile = v_other and i.to_profile = p_client))
        and i.status <> 'closed'
      order by i.created_at desc limit 1;

    if found then
      update public.introductions set
        request_type = 'meeting',
        status = case
          when status in ('pending', 'declined') then 'accepted'
          when status = 'meeting_done' and decision is null then 'accepted'
          else status
        end,
        decision_deadline = case
          when status = 'meeting_done' and decision is null then null
          else decision_deadline
        end,
        scheduled_at = p_scheduled_at,
        location = coalesce(v_location, location),
        meeting_mode = v_mode
      where id = v_row.id
      returning * into v_row;
      reused := true;
    else
      begin
        insert into public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location, meeting_mode)
          values (p_client, v_other, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location, v_mode)
          returning * into v_row;
      exception when unique_violation then
        begin
          insert into public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location, meeting_mode)
            values (v_other, p_client, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location, v_mode)
            returning * into v_row;
        exception when unique_violation then
          raise exception 'These two profiles already have closed requests both ways — reopen one from Coordination Requests instead';
        end;
      end;
      reused := false;
    end if;

    insert into public.profile_notes (profile_id, staff_user_id, introduction_id, note)
      values (p_client, auth.uid(), v_row.id,
        '📅 ' || case when v_mode = 'virtual' then 'Virtual meeting' else 'Meeting' end || ' fixed by admin: ' || v_when
        || coalesce(case when v_mode = 'virtual' then ' · link: ' else ' at ' end || v_location, '')
        || case when array_length(p_others, 1) > 1 then ' (group of ' || array_length(p_others, 1) || ' profiles)' else '' end);

    introduction_id := v_row.id;
    other_profile := v_other;
    request_id := v_row.request_id;
    return next;
  end loop;
end;
$$;
