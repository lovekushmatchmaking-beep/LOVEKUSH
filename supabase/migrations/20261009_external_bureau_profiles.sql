-- External/borrowed profiles — profiles sourced from another marriage bureau
-- (Aryan's workflow: takes a client from e.g. "X.MB", enters it here, finds a
-- match, sends it back — contact details are usually missing/withheld by the
-- other bureau on purpose). One nullable text column: non-null means the
-- profile is externally sourced; its value is the bureau's name/label.
-- No separate boolean needed — reuse-first, same pattern as lead_source.
alter table public.profiles
  add column if not exists external_bureau_name text;

create index if not exists profiles_external_bureau_idx
  on public.profiles(external_bureau_name)
  where external_bureau_name is not null;

comment on column public.profiles.external_bureau_name is
  'Set when this profile was sourced from another marriage bureau (e.g. "X.MB"). Non-null means the profile is externally sourced and contact details are typically missing/restricted — UI shows an "External" badge and a restricted-contact notice instead of a bare phone field.';
