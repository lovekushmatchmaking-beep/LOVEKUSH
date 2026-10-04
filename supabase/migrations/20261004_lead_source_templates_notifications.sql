-- Business-owner audit (2026-10-04, Aryan) — reuse-first fixes, no
-- payment/billing work (explicitly skipped for now).
--
-- 1. Lead source — one nullable column on the existing profiles table,
--    captured at signup/Create Client, usable as an admin filter/breakdown
--    dimension alongside the existing Breakdown panel.
-- 2. WhatsApp message templates — small admin-editable table so the
--    existing wa.me click-to-send flow (ContactButtons/shareProfile.js) can
--    fill in a saved message instead of typing from scratch. Simple
--    variable substitution ({{name}}, {{city}}, ...), no templating engine.
-- 3. Notification log — every trigger event (selfie requested, profile
--    approved, meeting scheduled, match shared) still has no automated
--    WhatsApp/SMS push (no vendor/API decided yet — see
--    docs/product/future-whatsapp-plan.md). This is the realistic
--    near-term version: a one-tap pre-filled wa.me link per event, with a
--    log of what was sent/to whom so "did we actually remind this client"
--    is answerable without digging through WhatsApp chat history.

alter table public.profiles
  add column if not exists lead_source text
    check (lead_source is null or lead_source in ('Referral', 'Online Ads', 'Walk-in', 'Website', 'Other'));

create index if not exists profiles_lead_source_idx on public.profiles(lead_source) where lead_source is not null;

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('selfie_requested', 'profile_approved', 'match_shared', 'meeting_scheduled', 'general')),
  name text not null,
  message text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_templates enable row level security;

-- Any active staff member can read/use templates when sending a WhatsApp
-- message; only an admin edits the shared list (same split as Manage Staff).
create policy "staff can read templates" on public.whatsapp_templates
  for select using (is_staff_member(auth.uid()));
create policy "admin can write templates" on public.whatsapp_templates
  for insert with check (is_staff_admin(auth.uid()));
create policy "admin can update templates" on public.whatsapp_templates
  for update using (is_staff_admin(auth.uid()));
create policy "admin can delete templates" on public.whatsapp_templates
  for delete using (is_staff_admin(auth.uid()));

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('selfie_requested', 'profile_approved', 'match_shared', 'meeting_scheduled', 'general')),
  channel text not null default 'whatsapp',
  staff_user_id uuid references auth.users(id),
  message_preview text,
  created_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;

create policy "staff can read notification log" on public.notification_log
  for select using (is_staff_member(auth.uid()));
create policy "staff can write notification log" on public.notification_log
  for insert with check (is_staff_member(auth.uid()));

create index if not exists notification_log_profile_id_idx on public.notification_log(profile_id);
create index if not exists notification_log_created_at_idx on public.notification_log(created_at desc);

-- Starter templates so the picker isn't empty on day one — admin can edit
-- or delete these like any other row. Guarded on an empty table so re-
-- running this migration never duplicates them.
insert into public.whatsapp_templates (category, name, message)
select * from (values
  ('selfie_requested', 'Selfie request', 'Hi {{name}}, this is LOVEKUSH Global Matchmaking Services. To verify your profile and make it live, please upload a quick selfie from your dashboard. Thank you!'),
  ('profile_approved', 'Profile approved', 'Hi {{name}}, good news — your LOVEKUSH profile has been verified and is now live. You can start viewing matches on your dashboard.'),
  ('match_shared', 'Match share follow-up', 'Hi {{name}}, we just shared a match with you on LOVEKUSH. Please have a look and let us know if you''d like us to set up a talk.'),
  ('meeting_scheduled', 'Meeting confirm', 'Hi {{name}}, confirming your meeting/call with {{otherName}} on {{when}}. Please let us know if you need to reschedule.')
) as t(category, name, message)
where not exists (select 1 from public.whatsapp_templates);
