-- Allow a new coordination request between a pair after the previous one
-- was closed or declined. Previously, UNIQUE(from_profile, to_profile) was
-- a hard forever-constraint — once A→B existed in ANY state (even closed),
-- no new A→B row could ever be created. Aryan: "circumstances change; if
-- both sides are now interested again, the system should not block forever."
--
-- Fix: drop the hard unique constraint, replace with a partial unique index
-- that only prevents duplicate active requests (status NOT IN closed/declined).
-- A closed/declined row no longer blocks a fresh start.
--
-- ALSO: update admin_schedule_meeting() — it previously caught unique_violation
-- and tried the reverse direction as a fallback. With the new partial index,
-- a closed row in the A→B direction no longer causes a violation, so the
-- try-reverse fallback is simplified (kept for safety but the error message
-- updated to reflect the new constraint).
--
-- Safe to run more than once (all DDL uses IF EXISTS / IF NOT EXISTS).

-- 1. Drop the hard forever-unique constraint.
ALTER TABLE public.introductions
  DROP CONSTRAINT IF EXISTS introductions_from_to_unique;

-- 2. Partial unique index: two profiles can have at most ONE non-closed,
--    non-declined request at any time (per direction). Once that row is
--    closed or declined, a new one can be created.
CREATE UNIQUE INDEX IF NOT EXISTS introductions_active_pair_unique
  ON public.introductions (from_profile, to_profile)
  WHERE status NOT IN ('closed', 'declined');

-- 3. Update admin_schedule_meeting to reflect the new constraint behaviour:
--    closed rows no longer cause unique_violation on insert, so the second
--    fallback INSERT (reverse direction) is kept but will only trigger if
--    two ACTIVE rows somehow exist (shouldn't happen under the partial index
--    but left as a safety net with an updated error message).
CREATE OR REPLACE FUNCTION public.admin_schedule_meeting(
  p_client uuid,
  p_others uuid[],
  p_scheduled_at timestamptz,
  p_location text DEFAULT NULL
)
RETURNS TABLE (introduction_id uuid, other_profile uuid, request_id text, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_other uuid;
  v_row public.introductions%rowtype;
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_when text := to_char(p_scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can schedule meetings';
  END IF;
  IF p_client IS NULL OR coalesce(array_length(p_others, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Pick the client and at least one profile to meet';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() - INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'Meeting time cannot be in the past';
  END IF;

  FOREACH v_other IN ARRAY p_others LOOP
    IF v_other = p_client THEN
      RAISE EXCEPTION 'A profile cannot have a meeting with itself';
    END IF;

    -- Look for an existing non-closed request in either direction.
    SELECT * INTO v_row FROM public.introductions i
      WHERE ((i.from_profile = p_client AND i.to_profile = v_other)
          OR (i.from_profile = v_other AND i.to_profile = p_client))
        AND i.status <> 'closed'
      ORDER BY i.created_at DESC LIMIT 1;

    IF found THEN
      UPDATE public.introductions SET
        request_type = 'meeting',
        status = CASE WHEN status IN ('pending', 'declined') THEN 'accepted' ELSE status END,
        scheduled_at = p_scheduled_at,
        location = coalesce(v_location, location)
      WHERE id = v_row.id
      RETURNING * INTO v_row;
      reused := true;
    ELSE
      -- No active row found. The partial unique index only blocks a new
      -- active row if one already exists; closed rows are now ignored, so
      -- a fresh insert should succeed. Reverse-direction fallback kept as
      -- a safety net.
      BEGIN
        INSERT INTO public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location)
          VALUES (p_client, v_other, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location)
          RETURNING * INTO v_row;
      EXCEPTION WHEN unique_violation THEN
        BEGIN
          INSERT INTO public.introductions (from_profile, to_profile, status, request_type, source, scheduled_at, location)
            VALUES (v_other, p_client, 'accepted', 'meeting', 'admin', p_scheduled_at, v_location)
            RETURNING * INTO v_row;
        EXCEPTION WHEN unique_violation THEN
          RAISE EXCEPTION 'These two profiles already have an active request — update it from Coordination Requests instead';
        END;
      END;
      reused := false;
    END IF;

    -- History line on the request (same profile_notes trail as calls/reschedules).
    INSERT INTO public.profile_notes (profile_id, staff_user_id, introduction_id, note)
      VALUES (p_client, auth.uid(), v_row.id,
        '📅 Meeting fixed by admin: ' || v_when || coalesce(' at ' || v_location, '')
        || CASE WHEN array_length(p_others, 1) > 1
               THEN ' (group of ' || array_length(p_others, 1) || ' profiles)'
               ELSE '' END);

    introduction_id := v_row.id;
    other_profile   := v_other;
    request_id      := v_row.request_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_schedule_meeting(uuid, uuid[], timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_meeting(uuid, uuid[], timestamptz, text) TO authenticated;
