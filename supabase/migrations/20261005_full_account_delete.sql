-- Aryan's audit (gap #8): account delete could fail with a DB constraint
-- error, and even when it "succeeded" it only removed the profile row —
-- login credentials (auth.users) stayed forever. The old client-side
-- delete manually deleted match_actions/introductions rows first to work
-- around RESTRICT foreign keys, but introductions has no DELETE RLS
-- policy for members, so those deletes silently did nothing (0 rows,
-- no error) and the final profiles delete still failed via the
-- introductions_from/to_profile_fkey RESTRICT constraint whenever the
-- member had any Talk/Meeting request. matches/messages (legacy, unused
-- tables) had the same RESTRICT problem.
--
-- Fix: widen all remaining RESTRICT foreign keys on profiles(id) to
-- CASCADE, matching the 20261003 migration's fix for share_links/
-- caste_suggestions/subscriptions. With that done, deleting the
-- auth.users row cascades all the way through (profiles_user_id_fkey was
-- already ON DELETE CASCADE) and cleans up everything in one step.
--
-- auth.users itself can't be deleted via a plain SQL/RPC call from the
-- client — only the Supabase Admin API (service-role key) can do that.
-- See supabase/functions/delete-account for the edge function that calls
-- it; AccountSettings.js now invokes that function instead of manually
-- deleting rows table by table.

alter table public.introductions drop constraint introductions_from_profile_fkey;
alter table public.introductions add constraint introductions_from_profile_fkey
  foreign key (from_profile) references public.profiles(id) on delete cascade;

alter table public.introductions drop constraint introductions_to_profile_fkey;
alter table public.introductions add constraint introductions_to_profile_fkey
  foreign key (to_profile) references public.profiles(id) on delete cascade;

alter table public.match_actions drop constraint match_actions_actor_profile_id_fkey;
alter table public.match_actions add constraint match_actions_actor_profile_id_fkey
  foreign key (actor_profile_id) references public.profiles(id) on delete cascade;

alter table public.match_actions drop constraint match_actions_target_profile_id_fkey;
alter table public.match_actions add constraint match_actions_target_profile_id_fkey
  foreign key (target_profile_id) references public.profiles(id) on delete cascade;

alter table public.matches drop constraint matches_profile_a_fkey;
alter table public.matches add constraint matches_profile_a_fkey
  foreign key (profile_a) references public.profiles(id) on delete cascade;

alter table public.matches drop constraint matches_profile_b_fkey;
alter table public.matches add constraint matches_profile_b_fkey
  foreign key (profile_b) references public.profiles(id) on delete cascade;

alter table public.messages drop constraint messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.messages drop constraint messages_receiver_id_fkey;
alter table public.messages add constraint messages_receiver_id_fkey
  foreign key (receiver_id) references public.profiles(id) on delete cascade;

-- Kept as a defense-in-depth fallback (not called by the app directly —
-- the edge function's auth.users delete cascades to profiles on its own)
-- in case a profile ever needs cleaning up without touching auth.users.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  delete from public.profiles where user_id = v_uid;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
