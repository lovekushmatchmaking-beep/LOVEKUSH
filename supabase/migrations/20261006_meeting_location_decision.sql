-- Remaining small gaps from the 2026-10-06 workflow audit:
--   #6 Meeting Location field — only Date/Time could be scheduled.
--   #5 24/48hr decision window — no field or reminder after a meeting closed.
--   #7 Clean Interested/Not-interested decision — only a free-text
--      positive/neutral/negative feedback rating existed, not the
--      business's actual yes/no.
--
-- Reuse-first: all three are plain columns on the existing `introductions`
-- row (same table call/meeting scheduling already uses), no new tables.
-- `decision_deadline` follows the exact same "overdue reminder" pattern
-- `profile_notes.follow_up_at` already uses in My Queue.

alter table public.introductions
  add column if not exists location text,
  add column if not exists decision text check (decision is null or decision in ('interested', 'not_interested')),
  add column if not exists decision_at timestamptz,
  add column if not exists decision_deadline timestamptz;

create index if not exists introductions_decision_deadline_idx
  on public.introductions(decision_deadline)
  where decision_deadline is not null and decision is null;
