-- Share-link → coordination bridge (Aryan's audit, 2026-10-05).
--
-- Gaps fixed, reuse-first (no new tables, existing share_links/introductions
-- untouched otherwise):
--   1. SharedMatches.js (the no-login client page) had no way for the
--      client to say "I like this one" — only a text instruction to reply
--      with the Profile ID over WhatsApp/call.
--   2. share_links had no record of WHICH CLIENT a link/bundle was made
--      for — only the profile_id being shown. So even if interest were
--      captured, admin couldn't tell whose match it was.
--   3. No per-profile interest signal existed at all — view_count already
--      bumps bundle-wide on page load (left untouched, out of scope here),
--      but nothing distinguished "opened" from "actually liked".
--
-- client_profile_id: nullable FK to the profile the link/bundle was
-- generated FOR (the client receiving matches) — set by the admin UI going
-- forward; existing rows stay null (unknown client, same as before).
alter table public.share_links add column if not exists client_profile_id uuid references public.profiles(id) on delete set null;

-- interested_at: client tapped "👍 Interested" on THIS profile's card in
-- the shared link/bundle. interest_acknowledged_at: admin has seen/actioned
-- it (clears it from "needs attention" without losing the record).
alter table public.share_links add column if not exists interested_at timestamptz;
alter table public.share_links add column if not exists interest_acknowledged_at timestamptz;

create index if not exists share_links_pending_interest_idx
  on public.share_links (interested_at)
  where interested_at is not null and interest_acknowledged_at is null;

-- Client (no account, no login) marks interest in one profile from a share
-- link/bundle. SECURITY DEFINER bypasses RLS the same way
-- get_shared_profile/get_shared_bundle already do — scoped strictly to the
-- one token passed in, same validity checks (not revoked/expired).
-- Idempotent: first tap sets the timestamp, later taps on the same link
-- are harmless no-ops (first-interest time is preserved).
create or replace function public.mark_share_link_interest(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_found boolean;
begin
  update public.share_links
    set interested_at = coalesce(interested_at, now())
    where token = p_token and coalesce(revoked, false) = false and expires_at > now()
  returning true into v_found;

  if not v_found then
    raise exception 'This share link is invalid, expired, or has been revoked.';
  end if;

  return true;
end;
$function$;

grant execute on function public.mark_share_link_interest(text) to anon, authenticated;
