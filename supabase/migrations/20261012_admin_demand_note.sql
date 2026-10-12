-- Admin-only "Demand / Note" field for the Find Matches side panel
-- (Aryan's ask, 2026-10-12): below the partner preferences, a free-text
-- field only staff can see or edit, capturing what consultation/calls
-- reveal about the client's real requirement (not captured by the
-- structured partner_* preference fields), to reference while matching.
--
-- Deliberately a separate one-row-per-profile table (not a profiles
-- column, not a profile_notes row): a profiles column would come back in
-- the client's own `select('*')` profile fetch (Dashboard.js loadProfile)
-- and leak to the client; a profile_notes row would get mixed into the
-- "Notes & Follow-ups" call-log timeline and re-insert a new row on every
-- edit instead of staying one editable field. This table is staff-only
-- (same is_staff_member() policy as profile_notes) and upserted in place.

create table if not exists public.admin_demand_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  note text not null default '',
  updated_by uuid references public.staff_users(user_id),
  updated_at timestamptz not null default now()
);

alter table public.admin_demand_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy where polname = 'staff manage admin demand notes'
      and polrelid = 'public.admin_demand_notes'::regclass
  ) then
    create policy "staff manage admin demand notes" on public.admin_demand_notes
      for all using (is_staff_member(auth.uid())) with check (is_staff_member(auth.uid()));
  end if;
end $$;
