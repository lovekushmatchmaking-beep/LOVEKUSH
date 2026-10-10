-- Aryan's ask (2026-10-10): two reuse-first extensions, no rebuild.
--
-- 1. Bureau coordination number — when a profile is tagged external_bureau_
--    name (sourced from another marriage bureau, [[external-bureau-profile-
--    tag]] / PR #114), the OTHER bureau's own contact number is what
--    coordination should go to (their client's number is withheld on
--    purpose). One new nullable column, same pattern as external_bureau_name
--    itself — no new table.
--
-- 2. Universal template editor — the existing whatsapp_templates table
--    (PR #79) already stores plain text + {{vars}}, which is channel-
--    agnostic; it just didn't have a category for bureau-to-bureau
--    coordination messages. Widen the category check constraint to add
--    'bureau_coordination' and seed a few very polite starter templates
--    for that scenario (Aryan specifically asked for this tone). No schema
--    rebuild — same table, same RLS, same substitution engine.

alter table public.profiles
  add column if not exists external_bureau_contact text;

comment on column public.profiles.external_bureau_contact is
  'Phone number of the OTHER marriage bureau/matchmaker who shared this external_bureau_name profile — coordination (e.g. "please confirm with your party") goes here, not to the client, since the bureau withholds the client''s own number.';

alter table public.whatsapp_templates
  drop constraint if exists whatsapp_templates_category_check;

alter table public.whatsapp_templates
  add constraint whatsapp_templates_category_check
  check (category in ('selfie_requested', 'profile_approved', 'match_shared', 'meeting_scheduled', 'interest_received', 'bureau_coordination', 'general'));

-- Seeded only if no bureau_coordination templates exist yet, so re-running
-- this migration (or a project that already has custom ones) never
-- duplicates rows.
insert into public.whatsapp_templates (category, name, message)
select * from (values
  ('bureau_coordination', 'First share — polite ask',
   'Namaskar {{name}} ji, aapki profile humare client ko pasand aayi hai. Kripya apni party se baat karke confirm kariye ki wo is match mein interested hain ya nahi. Dhanyavaad.'),
  ('bureau_coordination', 'Gentle follow-up (no reply yet)',
   'Namaskar {{name}} ji, pichhle sandesh ke baare mein thoda follow up kar raha hoon. Jab bhi aapko samay mile, apni party se ek baar poonch kar bata dein — koi jaldi nahi hai, aapka jawab aane tak intezaar karenge. Dhanyavaad.'),
  ('bureau_coordination', 'Share profile for match search',
   'Namaskar {{name}} ji, dhanyavaad profile share karne ke liye. Humne apne database mein check kiya aur {{count}} sambhavit profile mili hain. Inhe dekh kar bataiye ki kisi ke liye aapki party ko aage baat karni hai ya nahi.')
) as t(category, name, message)
where not exists (select 1 from public.whatsapp_templates where category = 'bureau_coordination');
