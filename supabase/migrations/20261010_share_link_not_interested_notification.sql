-- share_links: client tapped "Not for me" → notify the staff member who
-- generated the link (Aryan, 2026-10-10: "koi bhi notification nahi aa rahi").
--
-- Mirrors the existing trg_notify_share_link_interest trigger exactly —
-- same table, same AFTER UPDATE pattern, same security definer wrapper.
-- Only fires when not_interested_at goes from NULL → non-NULL so repeated
-- updates on the same row don't double-notify.

create or replace function public.trg_notify_share_link_not_interested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.not_interested_at is not null
     and old.not_interested_at is distinct from new.not_interested_at
     and new.created_by is not null
  then
    insert into public.notifications(recipient_user_id, type, message, link_entity_type, link_entity_id)
    values (new.created_by, 'share_link_not_interested', 'A client passed on a shared match.', 'share_link', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_share_link_not_interested on public.share_links;
create trigger notify_on_share_link_not_interested
  after update on public.share_links
  for each row execute function public.trg_notify_share_link_not_interested();
