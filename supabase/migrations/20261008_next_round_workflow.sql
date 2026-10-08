-- Phase 8 (audit 2026-10-08, P0 #11): a positive post-meeting decision
-- currently dead-ends — there's no next-round pipeline (horoscope check,
-- house visit, final meeting, contact disclosure, successful match).
-- Staff had to track all of this outside the app.
--
-- Reuses the SAME introductions row (same reuse-first pattern as Phase 7's
-- decision/decision_at/decision_deadline) rather than a new table — this is
-- one continuing interaction, not a new request. `next_round_stage` tracks
-- which step is next; `status='closed'` + `final_outcome` is the terminal
-- historical state (successful match or not proceeding), reusing the
-- existing Closed tab/filter rather than inventing a new one.

alter table public.introductions
  add column if not exists next_round_stage text
    check (next_round_stage is null or next_round_stage in
      ('horoscope_review', 'house_visit', 'final_meeting', 'contact_disclosure', 'successful_match')),
  add column if not exists house_visit_at timestamptz,
  add column if not exists final_meeting_at timestamptz,
  add column if not exists contact_disclosed_at timestamptz,
  add column if not exists contact_disclosed_by uuid references auth.users(id),
  add column if not exists final_outcome text
    check (final_outcome is null or final_outcome in ('successful_match', 'not_proceeding')),
  add column if not exists final_outcome_at timestamptz;
