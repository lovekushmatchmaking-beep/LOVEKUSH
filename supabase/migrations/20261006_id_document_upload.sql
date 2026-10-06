-- Real ID-proof (Aadhar/PAN/etc) document upload (audit gap 2026-10-06,
-- Model 1 step 2): `profiles.id_document_uploaded` was a dead boolean —
-- nothing in the app ever set it or showed an actual document to review.
-- "ID verified" could be true with no image ever having existed.
--
-- Reuse-first: mirrors the existing selfie-verification pattern exactly
-- (same storage bucket/path convention, same self-submit-only guard on the
-- verification trigger, same admin review queue) instead of a new table
-- or a new upload pipeline. id_document_uploaded is kept and still set
-- true on submit, so the existing completeness-score check in
-- src/utils/completeness.js needs no change.

alter table public.profiles
  add column if not exists id_document_path text,
  add column if not exists id_document_type text
    check (id_document_type is null or id_document_type in ('aadhar', 'pan', 'passport', 'voter_id', 'driving_license')),
  add column if not exists id_document_status text not null default 'not_submitted'
    check (id_document_status in ('not_submitted', 'submitted', 'approved', 'rejected')),
  add column if not exists id_document_submitted_at timestamptz,
  add column if not exists id_document_reviewed_at timestamptz;

-- Any profile that had the old dead flag set stays flagged as submitted
-- so it keeps surfacing in the verification queue (even though there's no
-- actual image behind it — admin will need to re-request from these).
update public.profiles set id_document_status = 'submitted'
  where id_document_uploaded = true and id_document_status = 'not_submitted';

-- Extend the existing self-service guard (selfie's rule, same shape):
-- a member can only move their own id_document_status from
-- not_submitted/rejected to submitted, with a path attached. Reviewing
-- (approved/rejected) and id_document_reviewed_at stay staff-only, same
-- as verification_status already is.
create or replace function public.guard_profile_verification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff_member(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.profile_status := 'pending';
    new.verification_status := 'not_started';
    new.is_verified := false;
    new.selfie_path := null;
    new.selfie_requested_at := null;
    new.selfie_submitted_at := null;
    new.id_document_path := null;
    new.id_document_status := 'not_submitted';
    new.id_document_submitted_at := null;
    new.id_document_reviewed_at := null;
    return new;
  end if;
  if new.profile_status is distinct from old.profile_status
     or new.is_verified is distinct from old.is_verified
     or new.selfie_requested_at is distinct from old.selfie_requested_at then
    raise exception 'Only LOVEKUSH staff can change profile status or verification';
  end if;
  if (new.verification_status is distinct from old.verification_status
      or new.selfie_path is distinct from old.selfie_path
      or new.selfie_submitted_at is distinct from old.selfie_submitted_at)
     and not (old.verification_status in ('selfie_requested', 'rejected')
              and new.verification_status = 'selfie_submitted'
              and new.selfie_path is not null) then
    raise exception 'Only LOVEKUSH staff can change profile status or verification';
  end if;
  if (new.id_document_status is distinct from old.id_document_status
      or new.id_document_path is distinct from old.id_document_path
      or new.id_document_submitted_at is distinct from old.id_document_submitted_at
      or new.id_document_reviewed_at is distinct from old.id_document_reviewed_at)
     and not (old.id_document_status in ('not_submitted', 'rejected')
              and new.id_document_status = 'submitted'
              and new.id_document_path is not null
              and new.id_document_reviewed_at is not distinct from old.id_document_reviewed_at) then
    raise exception 'Only LOVEKUSH staff can change ID document review status';
  end if;
  return new;
end;
$function$;

-- ===== Notifications: ID document submitted (staff) / reviewed (member) =====
-- Same idea as the existing selfie notifications in trg_notify_profile_changes.

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

  if new.id_document_status = 'submitted' and old.id_document_status is distinct from 'submitted' then
    perform public.notify_staff('id_document_submitted',
      coalesce(new.full_name, new.profile_code, 'A member') || ' submitted an ID document for verification.',
      'profile', new.id, new.managed_by_staff_id);
  end if;

  if new.id_document_status in ('approved', 'rejected') and old.id_document_status is distinct from new.id_document_status then
    perform public.notify_profile_owner(new.id,
      case when new.id_document_status = 'approved' then 'id_document_approved' else 'id_document_rejected' end,
      case when new.id_document_status = 'approved' then 'Your ID document was verified.'
           else 'Your ID document could not be verified — please upload a clearer copy.' end,
      'profile', new.id);
  end if;

  return new;
end;
$$;
