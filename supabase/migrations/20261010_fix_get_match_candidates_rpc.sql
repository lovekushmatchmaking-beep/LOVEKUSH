-- Fix get_match_candidates RPC: stale return type profiles_public_view_old → profiles_public_view.
-- Also adds empty-string handling for partner_religion ('' treated same as 'Any').
--
-- Cannot use CREATE OR REPLACE because the return type changes. DROP + CREATE.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Paste → Run).

DROP FUNCTION IF EXISTS get_match_candidates(integer);

CREATE OR REPLACE FUNCTION public.get_match_candidates(p_limit integer DEFAULT 60)
 RETURNS SETOF profiles_public_view
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and (me.partner_age_min is null or v.age is null or v.age >= me.partner_age_min)
      and (me.partner_age_max is null or v.age is null or v.age <= me.partner_age_max)
      and (v.partner_age_min is null or me.age is null or me.age >= v.partner_age_min)
      and (v.partner_age_max is null or me.age is null or me.age <= v.partner_age_max)
      -- religion: '' and 'Any' both mean no restriction
      and (me.partner_religion is null or me.partner_religion in ('', 'Any') or me.partner_religion = v.religion)
      and (v.partner_religion is null or v.partner_religion in ('', 'Any') or v.partner_religion = me.religion)
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
      and (
        me.partner_country_preference is null or me.partner_country_preference = 'Open to All'
        or v.country is null or v.country = me.partner_country_preference
      )
      and (
        v.partner_country_preference is null or v.partner_country_preference = 'Open to All'
        or me.country is null or me.country = v.partner_country_preference
      )
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
$function$;
