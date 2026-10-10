-- "Schedule Meeting" directly from admin (Aryan, 2026-10-10): fix a meeting
-- between a client and one or more profiles by Profile ID, with date/time
-- and location — no share link / Interested tap needed first. Each pair
-- becomes a normal introductions row, so it shows in Coordination Requests
-- and the existing Met -> 48-hour decision -> next-round flow works as-is.
--
-- Thread sessions cannot run schema changes on prod — Aryan runs this file
-- in the Supabase SQL Editor. Safe to run more than once.

-- 1. Allow source = 'admin' (same change as 20261010_admin_audit_gaps_2_3.sql,
--    repeated here so this file works on its own).
alter table public.introductions drop constraint if exists introductions_source_check;
alter table public.introductions add constraint introductions_source_check
  check (source in ('member', 'share_link', 'admin'));

-- 2. Staff can insert introductions. Before this only the "user creates
--    introduction" policy existed (from_profile must be your own profile),
--    so the Find Matches "Request meeting" button from PR #136 was blocked
--    by RLS for admins.
drop policy if exists "staff insert introductions" on public.introductions;
create policy "staff insert introductions" on public.introductions
  for insert with check (exists (select 1 from public.staff_users where staff_users.user_id = auth.uid()));

-- 3. One call for the whole meeting block: one client + N other profiles,
--    same date/time and location. If a pair already has an open request
--    (either direction) it is reused and just gets the time/location;
--    otherwise a new row is created as already accepted (admin has both
--    families' yes). Returns one row per pair.
create or replace function public.admin_schedule_meeting(
  p_client uuid,
  p_others uuid[],
  p_scheduled_at timestamptz,
  p_location text default null
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
        status = case when status in ('pending', 'declined') then 'accepted' else status end,
        scheduled_at = p_scheduled_at,
        location = coalesce(v_location, location)
      where id = v_row.id
      returning * into v_row;
      reused := true;
    else
      -- The (from, to) pair is unique; a closed old request in that
      -- direction would block a fresh one, so fall back to the reverse.
      begin
        insert into public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location)
          values (p_client, v_other, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location)
          returning * into v_row;
      exception when unique_violation then
        begin
          insert into public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location)
            values (v_other, p_client, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location)
            returning * into v_row;
        exception when unique_violation then
          raise exception 'These two profiles already have closed requests both ways — reopen one from Coordination Requests instead';
        end;
      end;
      reused := false;
    end if;

    -- History line on the request (same profile_notes trail as calls/reschedules)
    insert into public.profile_notes (profile_id, staff_user_id, introduction_id, note)
      values (p_client, auth.uid(), v_row.id,
        '📅 Meeting fixed by admin: ' || v_when || coalesce(' at ' || v_location, '')
        || case when array_length(p_others, 1) > 1 then ' (group of ' || array_length(p_others, 1) || ' profiles)' else '' end);

    introduction_id := v_row.id;
    other_profile := v_other;
    request_id := v_row.request_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.admin_schedule_meeting(uuid, uuid[], timestamptz, text) from public, anon;
grant execute on function public.admin_schedule_meeting(uuid, uuid[], timestamptz, text) to authenticated;
