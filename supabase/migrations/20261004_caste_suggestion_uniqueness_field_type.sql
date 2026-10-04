-- Fix: caste_suggestions uniqueness check was only (religion, suggested_name),
-- missing field_type. So the same name suggested for "caste" and for "gotra"
-- under the same religion incorrectly merged into one row.
-- Widen it to (religion, suggested_name, field_type).
--
-- Confirmed live on Supabase project wgzoabobdfvxvyuczhdz 2026-10-04:
--   constraint caste_suggestions_religion_suggested_name_key = UNIQUE (religion, suggested_name)
--   upsert_caste_suggestion()'s ON CONFLICT (religion, suggested_name)

alter table caste_suggestions
  drop constraint caste_suggestions_religion_suggested_name_key;

alter table caste_suggestions
  add constraint caste_suggestions_religion_suggested_name_field_type_key
  unique (religion, suggested_name, field_type);

create or replace function public.upsert_caste_suggestion(
  p_religion text,
  p_denomination text,
  p_suggested_name text,
  p_field_type text,
  p_submitted_by uuid
)
returns void
language plpgsql
security definer
as $function$
begin
  insert into caste_suggestions (religion, denomination, suggested_name, field_type, submitted_by_profile_id)
  values (p_religion, p_denomination, p_suggested_name, p_field_type, p_submitted_by)
  on conflict (religion, suggested_name, field_type)
  do update set times_suggested = caste_suggestions.times_suggested + 1, updated_at = now();
end;
$function$;
