-- Fix mark_share_link_not_interested: `NOT revoked` evaluates to NULL
-- (not TRUE) when revoked IS NULL — which is the default for all existing
-- rows. This caused the function to silently fail on older share links.
-- Fix: use `coalesce(revoked, false) = false`, same as mark_share_link_interest.

create or replace function public.mark_share_link_not_interested(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from share_links
   where token = p_token
     and coalesce(revoked, false) = false
     and expires_at > now();
  if not found then
    raise exception 'invalid or expired share link';
  end if;
  update share_links
     set not_interested_at = coalesce(not_interested_at, now())
   where id = v_id;
end;
$$;

grant execute on function public.mark_share_link_not_interested(text) to anon, authenticated;
