-- Fix get_match_candidates RPC: old function referenced profiles_public_view_old
-- (a stale return type from when the view was recreated). DROP + CREATE to fix.
-- Also adds handling for partner_religion = '' (empty string treated as 'Any').
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Paste → Run).
-- Cannot use CREATE OR REPLACE because the return type changed.

DROP FUNCTION IF EXISTS get_match_candidates(integer);

CREATE OR REPLACE FUNCTION get_match_candidates(p_limit integer DEFAULT 500)
RETURNS SETOF profiles_public_view
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM profiles_public_view p,
       profiles_public_view me
  WHERE me.id = auth.uid()
    -- opposite gender
    AND p.gender != me.gender
    -- age filters (bilateral)
    AND (me.partner_age_min IS NULL OR p.age >= me.partner_age_min)
    AND (me.partner_age_max IS NULL OR p.age <= me.partner_age_max)
    AND (p.partner_age_min IS NULL OR me.age >= p.partner_age_min)
    AND (p.partner_age_max IS NULL OR me.age <= p.partner_age_max)
    -- religion (bilateral) — empty string and 'Any' both mean no restriction
    AND (me.partner_religion IS NULL OR me.partner_religion IN ('', 'Any') OR me.partner_religion = p.religion)
    AND (p.partner_religion  IS NULL OR p.partner_religion  IN ('', 'Any') OR p.partner_religion  = me.religion)
    -- marital status compatibility
    AND (
      me.marital_status IS NULL OR p.marital_status IS NULL
      OR (me.marital_status = 'Never Married' AND p.marital_status = 'Never Married')
      OR (me.marital_status IN ('Divorced','Widowed') AND p.marital_status IN ('Divorced','Widowed'))
    )
    -- country preference (bilateral)
    AND (me.partner_country_preference IS NULL OR me.partner_country_preference = 'Open to All'
         OR p.country IS NULL OR me.partner_country_preference = p.country)
    AND (p.partner_country_preference  IS NULL OR p.partner_country_preference  = 'Open to All'
         OR me.country IS NULL OR p.partner_country_preference  = me.country)
    AND p.id != me.id
  LIMIT p_limit;
$$;
