-- Scale/perf audit (2026-10-04, Aryan): live DB check found `profiles` had
-- only 2 indexes (id, profile_code) — every "Female only" / "Active only"
-- query was a full table scan. Fine at today's size, will visibly slow
-- down once profiles run into the thousands. Zero-risk fix: add B-tree
-- indexes on the columns that are actually filtered/sorted on. This
-- changes nothing about app behavior or data, only query speed.
create index if not exists idx_profiles_gender on public.profiles (gender);
create index if not exists idx_profiles_profile_status on public.profiles (profile_status);
create index if not exists idx_profiles_religion on public.profiles (religion);
create index if not exists idx_profiles_community on public.profiles (community);
create index if not exists idx_profiles_city on public.profiles (city);
create index if not exists idx_profiles_created_at on public.profiles (created_at);
-- The Dashboard "Matches" query always filters gender + profile_status
-- together (see get_match_candidates below) — a composite index serves
-- that combination directly instead of combining two single-column scans.
create index if not exists idx_profiles_status_gender on public.profiles (profile_status, gender);

-- Dashboard "Matches" currently pulls the 500 newest opposite-gender active
-- profiles and does ALL filtering (age/religion/community/marital/country
-- preference, both directions) + scoring in the browser (matching.js) —
-- the code even had a comment from the original build saying this needs
-- to move into a Postgres function once scale grows. This RPC is that
-- move: it pushes the HARD filters (the ones that reject a profile
-- outright, mirroring matching.js's passesHardFilters) into one indexed
-- SQL query, so only a small relevant bucket comes down to the browser
-- instead of a fixed 500-row window. matching.js itself is untouched —
-- rankMatches still runs client-side on whatever this RPC returns,
-- re-applying passesHardFilters (safety net) and all of the soft scoring/
-- explanation logic exactly as before. Height preference and Guna Milan
-- dosha are NOT replicated here (height is a free-text string parsed in
-- JS; Guna Milan is a full astrology calc) — those stay purely client-side
-- via the existing passesHardFilters re-check on the returned bucket.
create or replace function public.get_match_candidates(p_limit int default 60)
returns setof public.profiles_public_view
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  me record;
  non_specific text[] := array['Any Community / No Bar', 'Inter-community', 'Others', 'Don''t wish to specify'];
  me_specific_communities text[];
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.id is null or me.profile_status <> 'active' then
    return;
  end if;

  me_specific_communities := array(
    select unnest(coalesce(me.partner_community_ids, '{}'::text[]))
    except select unnest(non_specific)
  );

  return query
    select v.*
    from public.profiles_public_view v
    where v.user_id <> auth.uid()
      and v.gender = (case when me.gender = 'Male' then 'Female' else 'Male' end)
      -- Age preference, dono taraf se
      and (me.partner_age_min is null or v.age is null or v.age >= me.partner_age_min)
      and (me.partner_age_max is null or v.age is null or v.age <= me.partner_age_max)
      and (v.partner_age_min is null or me.age is null or me.age >= v.partner_age_min)
      and (v.partner_age_max is null or me.age is null or me.age <= v.partner_age_max)
      -- Religion preference, dono taraf se ("Any" = no restriction)
      and (me.partner_religion is null or me.partner_religion = 'Any' or me.partner_religion = v.religion)
      and (v.partner_religion is null or v.partner_religion = 'Any' or v.partner_religion = me.religion)
      -- Community preference, dono taraf se (NON_SPECIFIC values = no restriction)
      and (
        array_length(me_specific_communities, 1) is null
        or v.community = any(me_specific_communities)
      )
      and (
        array_length(array(
          select unnest(coalesce(v.partner_community_ids, '{}'::text[]))
          except select unnest(non_specific)
        ), 1) is null
        or me.community = any(array(
          select unnest(coalesce(v.partner_community_ids, '{}'::text[]))
          except select unnest(non_specific)
        ))
      )
      -- Education level preference, dono taraf se (empty list = sab acceptable)
      and (
        coalesce(array_length(me.partner_education_level_preferences, 1), 0) = 0
        or v.education is null
        or v.education = any(me.partner_education_level_preferences)
      )
      and (
        coalesce(array_length(v.partner_education_level_preferences, 1), 0) = 0
        or me.education is null
        or me.education = any(v.partner_education_level_preferences)
      )
      -- Country preference, dono taraf se ("Open to All" = no restriction)
      and (
        me.partner_country_preference is null or me.partner_country_preference = 'Open to All'
        or v.country is null or v.country = me.partner_country_preference
      )
      and (
        v.partner_country_preference is null or v.partner_country_preference = 'Open to All'
        or me.country is null or me.country = v.partner_country_preference
      )
      -- Marital status compatibility (Never-Married only with Never-Married;
      -- Divorced/Widowed with each other) — same map as matching.js
      and (
        me.marital_status is null or v.marital_status is null
        or v.marital_status = any(
          case me.marital_status
            when 'Never Married' then array['Never Married']
            when 'Divorced' then array['Divorced', 'Widowed']
            when 'Widowed' then array['Divorced', 'Widowed']
            else array[me.marital_status]
          end
        )
      )
    order by v.created_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_match_candidates(int) to authenticated;
