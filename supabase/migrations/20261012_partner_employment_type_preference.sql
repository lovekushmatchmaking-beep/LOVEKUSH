-- Partner Preference: Occupation / Sector preference (Aryan's ask,
-- 2026-10-12) — Private sector / Government / Business / etc. was
-- missing from Partner Preferences; matches the existing employment_type
-- field (profiles.employment_type, EMPLOYMENT_TYPES constant), same
-- multi-select pattern as partner_education_level_preferences (empty =
-- no restriction).

alter table public.profiles
  add column if not exists partner_employment_type_preferences text[] not null default '{}';
