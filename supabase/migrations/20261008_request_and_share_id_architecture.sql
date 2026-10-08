-- ID architecture (audit 2026-10-08, Phase 1): Profile ID already exists
-- (profiles.profile_code, e.g. "LK10025"). This adds the other two IDs
-- the audit calls out as missing — Request ID and Share ID — as
-- human-readable, stable identifiers that never change when status
-- changes. Purely additive: no existing column/table is touched, no
-- existing query breaks.
--
-- Request ID examples: REQ-COR-261008-0001 (talk), REQ-MTG-261008-0002 (meeting)
-- Share ID example:    SHR-261008-0001

create sequence if not exists public.request_id_seq;
create sequence if not exists public.share_id_seq;

alter table public.introductions add column if not exists request_id text unique;
alter table public.share_links add column if not exists share_id text unique;

create or replace function public.gen_request_id() returns trigger as $$
declare
  type_code text;
begin
  if new.request_id is not null then
    return new;
  end if;
  type_code := case new.request_type when 'meeting' then 'MTG' else 'COR' end;
  new.request_id := 'REQ-' || type_code || '-' || to_char(now(), 'YYMMDD') || '-'
    || lpad(nextval('public.request_id_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_request_id on public.introductions;
create trigger set_request_id
  before insert on public.introductions
  for each row execute function public.gen_request_id();

create or replace function public.gen_share_id() returns trigger as $$
begin
  if new.share_id is not null then
    return new;
  end if;
  new.share_id := 'SHR-' || to_char(now(), 'YYMMDD') || '-'
    || lpad(nextval('public.share_id_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_share_id on public.share_links;
create trigger set_share_id
  before insert on public.share_links
  for each row execute function public.gen_share_id();

-- Backfill existing rows (ordered by created_at so earlier records keep
-- lower sequence numbers; stamped with today's date since original
-- creation dates vary and the date segment is informational only).
do $$
declare r record;
begin
  for r in select id, request_type from public.introductions where request_id is null order by created_at loop
    update public.introductions
      set request_id = 'REQ-' || (case r.request_type when 'meeting' then 'MTG' else 'COR' end)
        || '-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.request_id_seq')::text, 4, '0')
      where id = r.id;
  end loop;

  for r in select id from public.share_links where share_id is null order by created_at loop
    update public.share_links
      set share_id = 'SHR-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.share_id_seq')::text, 4, '0')
      where id = r.id;
  end loop;
end $$;
