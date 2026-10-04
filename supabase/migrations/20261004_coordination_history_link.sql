-- Coordination workflow audit fixes (2026-10-04, Aryan's end-to-end review
-- of CoordinationRequestsView + MyQueueView + Dashboard request flow).
--
-- Reuse-first: no new tables. The only schema change is one nullable link
-- column so a coordination request's calls/notes/meeting outcomes land in
-- the SAME profile_notes table the rest of the admin panel already uses
-- (Notes & Follow-ups), instead of only the single close-time feedback
-- line introductions.feedback holds today. That also makes a client's
-- coordination history show up automatically wherever that profile's notes
-- already render (profile list, My Queue).
--
-- introductions.status has no check constraint (free text, default
-- 'pending'), so adding a 'meeting_done' stage between a call and closing
-- (to stop "contacted" meaning both "we called" and "they met") needs no
-- migration of its own — existing rows are untouched.

alter table public.profile_notes
  add column if not exists introduction_id uuid references public.introductions(id) on delete cascade;

create index if not exists profile_notes_introduction_id_idx
  on public.profile_notes(introduction_id) where introduction_id is not null;
