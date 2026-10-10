-- Two of the 5 admin-audit gaps Aryan asked to fix (2026-10-10) need schema
-- changes that thread sessions cannot run on prod — Aryan runs this file's
-- contents in the Supabase SQL Editor.

-- Gap 2: admin can now start a Talk/Meeting request directly from Find
-- Matches (an introductions row with source='admin'), instead of only via
-- a share-link interest forward (source='share_link') or a member's own
-- action (source='member'). Widen the existing check constraint.
alter table public.introductions drop constraint if exists introductions_source_check;
alter table public.introductions add constraint introductions_source_check
  check (source in ('member', 'share_link', 'admin'));

-- Gap 3: "Not for me" share-link signal had no way to be acknowledged, so
-- it stayed a permanent badge in My Queue / Dashboard stats forever. New
-- column mirrors the existing interest_acknowledged_at pattern.
alter table public.share_links add column if not exists not_interest_acknowledged_at timestamptz;
