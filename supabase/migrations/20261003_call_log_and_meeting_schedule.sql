-- Call-heavy admin workflow: structured call outcome on existing
-- profile_notes (RM ab "Add note" ke saath outcome bhi chunta hai — koi
-- naya table nahi, bas 2 columns), aur introductions (Talk/Meeting
-- requests) par date/time schedule karne ki field, taaki "aaj ki meetings"
-- My Queue mein dikh sake.

alter table public.profile_notes
  add column if not exists call_outcome text
    check (call_outcome is null or call_outcome in ('answered', 'no_answer', 'call_back', 'not_interested'));

alter table public.introductions
  add column if not exists scheduled_at timestamptz;

create index if not exists introductions_scheduled_at_idx on public.introductions(scheduled_at) where scheduled_at is not null;
