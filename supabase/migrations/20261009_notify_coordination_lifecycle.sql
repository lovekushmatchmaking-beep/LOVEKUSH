-- Notification audit (Aryan, 2026-10-09): "kai notifications ya to kaam
-- nahi kar rahi, ya galat/incomplete jagah le ja rahi hain."
--
-- Root cause for the biggest gap: Phase 7/8 of the full product audit
-- (PRs #91-103, merged 2026-10-08) added a whole post-meeting lifecycle on
-- introductions — meeting marked Done, 48h decision window
-- (decision/decision_at), the next-round pipeline
-- (next_round_stage: horoscope_review -> house_visit -> final_meeting ->
-- contact_disclosure -> successful_match) and the terminal
-- final_outcome/final_outcome_at — but nothing ever notified either member
-- when any of it happened. Members had zero visibility past "meeting
-- scheduled"; every later update was admin-only.
--
-- Reuse-first: extends the SAME trg_notify_introduction_update() trigger
-- function that already fires notify_profile_owner() for scheduled_at
-- (20261005_in_app_notifications.sql) — same helper, same trigger, same
-- AFTER UPDATE on introductions. No new table, no change to Admin.js's
-- existing handleAction/handleDecision/handleAdvanceRound/
-- handleDiscloseAndComplete/handleNotProceeding writes.
--
-- link_entity_type/id stays 'introduction'/new.id throughout, same as the
-- existing coordination_request_received/meeting_scheduled rows, so the
-- member app's existing notifFocusId deep-link (Dashboard.js RequestsTab)
-- already scrolls straight to the right card for every type added here —
-- no client-side routing change needed for that part.

create or replace function public.trg_notify_introduction_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage_label text;
begin
  if new.scheduled_at is not null and old.scheduled_at is distinct from new.scheduled_at then
    perform public.notify_profile_owner(new.from_profile, 'meeting_scheduled',
      'Your call/meeting has been scheduled.', 'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'meeting_scheduled',
      'Your call/meeting has been scheduled.', 'introduction', new.id);
  end if;

  -- Meeting marked Done (starts the 48h decision window) — members had no
  -- way to know a decision was coming.
  if new.status = 'meeting_done' and old.status is distinct from 'meeting_done' then
    perform public.notify_profile_owner(new.from_profile, 'meeting_done',
      'Your meeting has been marked complete. We will share an update on next steps soon.', 'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'meeting_done',
      'Your meeting has been marked complete. We will share an update on next steps soon.', 'introduction', new.id);
  end if;

  -- Positive/Negative decision recorded after the meeting.
  if new.decision is not null and old.decision is distinct from new.decision then
    perform public.notify_profile_owner(new.from_profile, 'decision_recorded',
      case when new.decision = 'interested'
        then 'Good news — your recent meeting is moving forward to the next round.'
        else 'Your recent meeting outcome has been recorded.' end,
      'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'decision_recorded',
      case when new.decision = 'interested'
        then 'Good news — your recent meeting is moving forward to the next round.'
        else 'Your recent meeting outcome has been recorded.' end,
      'introduction', new.id);
  end if;

  -- Next-round pipeline advancing — one notification per stage except
  -- successful_match, which the final_outcome block below already covers
  -- (handleDiscloseAndComplete sets both columns in the same write, so
  -- this avoids sending two notifications for one event).
  if new.next_round_stage is not null and old.next_round_stage is distinct from new.next_round_stage
     and new.next_round_stage <> 'successful_match' then
    v_stage_label := case new.next_round_stage
      when 'horoscope_review' then 'Your match is being reviewed for horoscope compatibility.'
      when 'house_visit' then 'A house visit is being arranged for your match.'
      when 'final_meeting' then 'A final meeting is being arranged for your match.'
      when 'contact_disclosure' then 'Your match is moving to the final step — contact details will be shared soon.'
      else 'There is an update on your match.'
    end;
    perform public.notify_profile_owner(new.from_profile, 'next_round_stage', v_stage_label, 'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'next_round_stage', v_stage_label, 'introduction', new.id);
  end if;

  -- Terminal outcome — successful match (contact disclosed) or not
  -- proceeding, from any stage.
  if new.final_outcome is not null and old.final_outcome is distinct from new.final_outcome then
    perform public.notify_profile_owner(new.from_profile, 'match_outcome',
      case when new.final_outcome = 'successful_match'
        then 'Congratulations! Your match has been marked successful — contact details have been shared.'
        else 'This match has been closed — it will not be proceeding further.' end,
      'introduction', new.id);
    perform public.notify_profile_owner(new.to_profile, 'match_outcome',
      case when new.final_outcome = 'successful_match'
        then 'Congratulations! Your match has been marked successful — contact details have been shared.'
        else 'This match has been closed — it will not be proceeding further.' end,
      'introduction', new.id);
  end if;

  return new;
end;
$$;

-- Trigger definition itself (AFTER UPDATE on introductions) is unchanged —
-- only the function body above changed, so no drop/create needed here.
