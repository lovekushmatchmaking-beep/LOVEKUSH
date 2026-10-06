-- Forward a client's share-link "👍 Interested" signal to the matched
-- profile (Aryan's Model 2, step 6 — the biggest genuinely-missing piece
-- from the 2026-10-06 workflow audit): "is profile ne aapko like kiya hai,
-- interested hai meeting ke liye". Until now an admin could only see the
-- interest and privately "Mark as noted" — nothing ever reached the
-- matched member.
--
-- Reuse-first:
--   * If the share link/bundle was generated for a known client profile
--     (client_profile_id set — PR #82), we create a normal `introductions`
--     row from that client to the shown profile. That drops it straight
--     into the existing Coordination Requests / My Queue pipeline (same
--     scheduling, call-log, feedback flow as any Talk/Meet request) and
--     the existing notify_on_introduction_insert trigger (PR #83) already
--     notifies the shown profile — no new trigger needed.
--   * If the client is anonymous (no account, just a share-link visitor —
--     the common case for Model 2), there's no from_profile to attach, so
--     we notify the shown profile directly via the existing
--     notify_profile_owner() helper instead.
--
-- `source` on introductions distinguishes these from normal member-
-- initiated requests, so the UI can show something clearer than
-- "Unknown → X".

alter table public.introductions
  add column if not exists source text not null default 'member'
    check (source in ('member', 'share_link'));

alter table public.share_links
  add column if not exists forwarded_at timestamptz,
  add column if not exists forwarded_introduction_id uuid references public.introductions(id) on delete set null;

create or replace function public.forward_share_link_interest(p_link_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    insert into public.introductions (from_profile, to_profile, status, request_type, source)
    values (v_link.client_profile_id, v_link.profile_id, 'pending', 'meeting', 'share_link')
    returning id into v_intro_id;
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

grant execute on function public.forward_share_link_interest(uuid) to authenticated;
