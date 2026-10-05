-- In-app notification system (Aryan's repeated audit gap, 2026-10-05):
-- neither members nor staff get told when something happens to them —
-- profile approved/blocked, selfie requested, photo request
-- approved/received, a client showed interest in a shared match, a
-- coordination/talk/meet request came in, a meeting got scheduled, a
-- report was filed, a caste/gotra suggestion was reviewed.
--
-- Scope: in-app only (bell + dropdown, this migration + the UI that reads
-- it). WhatsApp/SMS/email/push are a separate, bigger piece blocked on a
-- vendor decision — not built here.
--
-- Reuse-first: zero changes to existing event logic/flows. Every existing
-- insert/update statement (profile_status, verification_status,
-- photo_requests, introductions, profile_reports, caste_suggestions,
-- share_links.interested_at) keeps firing exactly as it already does;
-- these are pure AFTER triggers bolted onto the existing tables, so no
-- app code needed to change for an event to start producing a
-- notification row.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  message text not null,
  link_entity_type text,
  link_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_user_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id) where is_read = false;

-- Everyone (member or staff) reads/updates only their own notifications.
-- No insert policy for plain users — rows are only ever written by the
-- SECURITY DEFINER trigger functions below, same pattern as the other
-- SECURITY DEFINER RPCs already in this schema (mark_share_link_interest,
-- get_shared_profile, etc.).
create policy "recipient reads own notifications" on public.notifications
  for select using (recipient_user_id = auth.uid());
create policy "recipient marks own notifications read" on public.notifications
  for update using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- ===== Helpers =====

-- Resolve a profile's auth user and insert one notification for them.
-- Silently no-ops for admin-created profiles with no linked auth user.
create or replace function public.notify_profile_owner(
  p_profile_id uuid, p_type text, p_message text, p_link_type text, p_link_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  select user_id into v_user_id from public.profiles where id = p_profile_id;
  if v_user_id is not null then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (v_user_id, p_type, p_message, p_link_type, p_link_id);
  end if;
end;
$$;

-- Notify one specific staff user if given (e.g. the RM assigned via
-- managed_by_staff_id, or a share link's created_by), else broadcast to
-- every active staff member (admin + RM) — used when there's no single
-- obvious owner (e.g. an unassigned profile's selfie submission, or a new
-- report, which any admin/RM should see).
create or replace function public.notify_staff(
  p_type text, p_message text, p_link_type text, p_link_id uuid, p_only_staff_user_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_only_staff_user_id is not null then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (p_only_staff_user_id, p_type, p_message, p_link_type, p_link_id);
  else
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    select user_id, p_type, p_message, p_link_type, p_link_id
    from public.staff_users where active = true;
  end if;
end;
$$;

-- ===== profiles: profile approved/blocked, selfie requested/submitted =====

create or replace function public.trg_notify_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_status = 'active' and old.profile_status is distinct from 'active' then
    perform public.notify_profile_owner(new.id, 'profile_approved',
      'Your profile has been approved and is now live!', 'profile', new.id);
  elsif new.profile_status = 'blocked' and old.profile_status is distinct from 'blocked' then
    perform public.notify_profile_owner(new.id, 'profile_blocked',
      'Your profile has been blocked. Contact support for details.', 'profile', new.id);
  end if;

  if new.verification_status = 'selfie_requested' and old.verification_status is distinct from 'selfie_requested' then
    perform public.notify_profile_owner(new.id, 'selfie_requested',
      'Please upload a selfie from your dashboard to verify your profile.', 'profile', new.id);
  end if;

  if new.verification_status = 'selfie_submitted' and old.verification_status is distinct from 'selfie_submitted' then
    perform public.notify_staff('selfie_submitted',
      coalesce(new.full_name, new.profile_code, 'A member') || ' submitted a selfie for verification.',
      'profile', new.id, new.managed_by_staff_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_profile_change on public.profiles;
create trigger notify_on_profile_change
  after update on public.profiles
  for each row execute function public.trg_notify_profile_changes();

-- ===== photo_requests: request received, request approved =====

create or replace function public.trg_notify_photo_request_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_profile_owner(new.owner_profile_id, 'photo_request_received',
    'Someone requested to view your photo.', 'photo_request', new.id);
  return new;
end;
$$;

drop trigger if exists notify_on_photo_request_insert on public.photo_requests;
create trigger notify_on_photo_request_insert
  after insert on public.photo_requests
  for each row execute function public.trg_notify_photo_request_insert();

create or replace function public.trg_notify_photo_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.notify_profile_owner(new.requester_profile_id, 'photo_request_approved',
      'Your photo request was approved — you can now view their photo.', 'photo_request', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_photo_request_update on public.photo_requests;
create trigger notify_on_photo_request_update
  after update on public.photo_requests
  for each row execute function public.trg_notify_photo_request_update();

-- ===== introductions: talk/meet request received, meeting scheduled =====

create or replace function public.trg_notify_introduction_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_profile_owner(new.to_profile, 'coordination_request_received',
    case when new.request_type = 'meeting' then 'You have a new meeting request.'
         else 'You have a new talk request.' end,
    'introduction', new.id);
  return new;
end;
$$;

drop trigger if exists notify_on_introduction_insert on public.introductions;
create trigger notify_on_introduction_insert
  after insert on public.introductions
  for each row execute function public.trg_notify_introduction_insert();

create or replace function public.trg_notify_introduction_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scheduled_at is not null and old.scheduled_at is distinct from new.scheduled_at then
    perform public.notify_profile_owner(new.from_profile, 'meeting_scheduled',
      'Your call/meeting has been scheduled.', 'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'meeting_scheduled',
      'Your call/meeting has been scheduled.', 'introduction', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_introduction_update on public.introductions;
create trigger notify_on_introduction_update
  after update on public.introductions
  for each row execute function public.trg_notify_introduction_update();

-- ===== profile_reports: report filed =====

create or replace function public.trg_notify_report_filed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_staff('report_filed', 'A new profile report was filed.', 'profile_report', new.id, null);
  return new;
end;
$$;

drop trigger if exists notify_on_report_filed on public.profile_reports;
create trigger notify_on_report_filed
  after insert on public.profile_reports
  for each row execute function public.trg_notify_report_filed();

-- ===== caste_suggestions: reviewed (approved/rejected by admin) =====

create or replace function public.trg_notify_caste_suggestion_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' and new.submitted_by_profile_id is not null then
    perform public.notify_profile_owner(new.submitted_by_profile_id, 'caste_suggestion_reviewed',
      'Your suggested ' || new.field_type || ' "' || new.suggested_name || '" was ' || new.status || '.',
      'caste_suggestion', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_caste_suggestion_update on public.caste_suggestions;
create trigger notify_on_caste_suggestion_update
  after update on public.caste_suggestions
  for each row execute function public.trg_notify_caste_suggestion_reviewed();

-- ===== share_links: client marked interest (PR #82's "Interested" button) =====
-- Notify the staff member who generated the link (created_by) — they're
-- the one who'll want to follow up.

create or replace function public.trg_notify_share_link_interest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.interested_at is not null and old.interested_at is distinct from new.interested_at and new.created_by is not null then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (new.created_by, 'share_link_interest', 'A client marked interest in a shared match.', 'share_link', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_share_link_interest on public.share_links;
create trigger notify_on_share_link_interest
  after update on public.share_links
  for each row execute function public.trg_notify_share_link_interest();
