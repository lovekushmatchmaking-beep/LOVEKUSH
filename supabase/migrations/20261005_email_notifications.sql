-- Aryan's audit (gap #9): no notification channel existed besides the
-- in-app bell (PR "in-app notifications", 2026-10-05) — a client had no
-- way to learn about a new introduction/meeting-schedule unless they
-- opened the app. WhatsApp/SMS stay out of scope (no vendor chosen yet),
-- but email needs no new paid vendor — Supabase's own SMTP (same account
-- already usable for Auth emails) can send these.
--
-- Reuse-first: public.notify_profile_owner() already fires for every
-- relevant event via existing triggers (trg_notify_introduction_insert,
-- trg_notify_introduction_update, etc) and writes the in-app notification
-- row. It now ALSO fires an async pg_net HTTP call to the new
-- supabase/functions/notify-email edge function, for two curated event
-- types that match Aryan's ask (new introduction received, meeting
-- scheduled). Other existing notification types (photo request, report
-- filed, profile changes, caste suggestion reviewed, share-link interest)
-- are intentionally left as in-app-only for now — not asked for, and
-- emailing on every one of those would be noisy.
--
-- The edge function no-ops safely until Aryan sets SMTP_HOST / SMTP_PORT /
-- SMTP_USER / SMTP_PASS / SMTP_FROM as Edge Function secrets (Supabase
-- Dashboard > Edge Functions > notify-email > Secrets) — same SMTP
-- account already configured for Auth emails can be reused. Until those
-- secrets are set, every call returns {skipped:true}.
--
-- A hardcoded shared secret (not the service-role key — that can't be
-- read from this migration/session) gates the edge function so a public
-- caller holding only the project's anon key can't spam arbitrary emails
-- through it. Rotate by changing the literal in both this function and
-- supabase/functions/notify-email/index.ts, then redeploying the function.

create extension if not exists pg_net;

create or replace function public.notify_profile_owner(p_profile_id uuid, p_type text, p_message text, p_link_type text, p_link_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user_id uuid;
begin
  select user_id into v_user_id from public.profiles where id = p_profile_id;
  if v_user_id is not null then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (v_user_id, p_type, p_message, p_link_type, p_link_id);

    if p_type in ('coordination_request_received', 'meeting_scheduled') then
      perform net.http_post(
        url := 'https://wgzoabobdfvxvyuczhdz.supabase.co/functions/v1/notify-email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', '7cd4b6a65a3841dfaaa1207b6cbcc18b4494b5f5f93b566681550e5619b514e'),
        body := jsonb_build_object('user_id', v_user_id, 'type', p_type, 'message', p_message)
      );
    end if;
  end if;
end;
$$;
