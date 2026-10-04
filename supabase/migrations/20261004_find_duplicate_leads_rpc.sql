-- Scale/bulk-load audit (2026-10-04, Aryan): "Duplicate Leads" screen was
-- pulling the ENTIRE profiles table (every row, every status) into the
-- browser just to find the handful that share a phone/email — fine at
-- today's size, but it would load every row on the table on every visit as
-- the database grows. Reuse-first fix: push the duplicate-detection itself
-- into Postgres with a SECURITY DEFINER RPC, so only the (small) set of
-- profiles that actually share a phone/email ever comes down to the
-- browser. DuplicateLeadsView.js's own grouping logic (findDuplicateLeads)
-- is unchanged — it still turns this row list into { phone/email -> [profiles] }
-- groups, just from a server-filtered list instead of the full table.
create or replace function public.find_duplicate_leads()
returns table (
  id uuid,
  full_name text,
  profile_code text,
  age int,
  city text,
  profile_status text,
  client_phone text,
  client_email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_staff_member(auth.uid()) then
    raise exception 'Only staff can view duplicate leads';
  end if;

  return query
    select p.id, p.full_name, p.profile_code, p.age, p.city, p.profile_status,
           p.client_phone, p.client_email, p.created_at
    from profiles p
    where (
      p.client_phone is not null and p.client_phone <> '' and exists (
        select 1 from profiles p2 where p2.client_phone = p.client_phone and p2.id <> p.id
      )
    ) or (
      p.client_email is not null and p.client_email <> '' and exists (
        select 1 from profiles p2 where lower(p2.client_email) = lower(p.client_email) and p2.id <> p.id
      )
    );
end;
$$;

grant execute on function public.find_duplicate_leads() to authenticated;
