-- In-app staff management (PR follow-up, 2026-10-03). Previously the only
-- way to add an admin/RM was to insert into staff_users directly via the
-- Supabase dashboard. staff_users.user_id is a FK to auth.users, so a new
-- staff member must sign up for a normal account first (via Register.js);
-- an existing admin then promotes that email here. These SECURITY DEFINER
-- functions let the client do that safely without a service-role key,
-- gated on is_staff_admin(auth.uid()).

create or replace function public.assign_staff_role(target_email text, target_role text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_uid uuid;
begin
  if not is_staff_admin(auth.uid()) then
    raise exception 'Only an admin can add staff';
  end if;
  if target_role not in ('admin','relationship_manager') then
    raise exception 'Invalid role';
  end if;

  select id into target_uid from auth.users where lower(email) = lower(trim(target_email)) limit 1;
  if target_uid is null then
    raise exception 'No account found for this email yet — ask them to sign up first, then add them here.';
  end if;

  insert into staff_users (user_id, role, active)
  values (target_uid, target_role, true)
  on conflict (user_id) do update set role = excluded.role, active = true, updated_at = now();

  return json_build_object('ok', true);
end;
$$;

create or replace function public.set_staff_active(target_user_id uuid, is_active boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_staff_admin(auth.uid()) then
    raise exception 'Only an admin can change staff status';
  end if;
  if target_user_id = auth.uid() and not is_active then
    raise exception 'You cannot deactivate your own account';
  end if;
  update staff_users set active = is_active, updated_at = now() where user_id = target_user_id;
end;
$$;

create or replace function public.list_staff_with_email()
returns table(id uuid, user_id uuid, email text, role text, active boolean, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_staff_admin(auth.uid()) then
    raise exception 'Only an admin can view the staff list';
  end if;
  return query
    select s.id, s.user_id, u.email, s.role, s.active, s.created_at
    from staff_users s
    join auth.users u on u.id = s.user_id
    order by s.created_at asc;
end;
$$;

grant execute on function public.assign_staff_role(text, text) to authenticated;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.list_staff_with_email() to authenticated;
