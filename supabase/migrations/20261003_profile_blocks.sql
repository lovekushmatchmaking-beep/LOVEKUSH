-- Real Block — pehle "Block" button bhi "Pass" (match_actions dislike)
-- jaisa hi kaam karta tha: blocked insaan ab bhi aapko match list, search
-- aur Talk/Meet me dikh sakta tha aur request bhej sakta tha. Ab Block
-- dono taraf se chhupata hai — na wo aapko dikhega, na aap use, na wo
-- koi naya request bhej sakta hai.
--
-- "Pass" (match card ka X button) alag hi rehta hai — reversible,
-- sirf meri taraf se match list se hatata hai (match_actions dislike).

create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);
create index if not exists profile_blocks_blocked_idx on public.profile_blocks(blocked_profile_id);

alter table public.profile_blocks enable row level security;

create policy "blocker manages own blocks" on public.profile_blocks for all
  using (blocker_profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (blocker_profile_id in (select id from public.profiles where user_id = auth.uid()));

-- Doosri taraf bhi apna hi block read kar sake — taaki UI dono directions
-- client-side exclude kar sake (match list, search, requests).
create policy "blocked party reads the block" on public.profile_blocks for select
  using (blocked_profile_id in (select id from public.profiles where user_id = auth.uid()));

create policy "staff reads all blocks" on public.profile_blocks for select
  using (exists (select 1 from public.staff_users where user_id = auth.uid()));

-- Blocked pair ke beech naya Talk/Meet request na jaaye (dono taraf se).
create or replace function public.guard_introduction_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profile_blocks
    where (blocker_profile_id = new.from_profile and blocked_profile_id = new.to_profile)
       or (blocker_profile_id = new.to_profile and blocked_profile_id = new.from_profile)
  ) then
    raise exception 'Cannot send a request to a blocked profile';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_introduction_not_blocked on public.introductions;
create trigger guard_introduction_not_blocked
  before insert on public.introductions
  for each row execute function public.guard_introduction_not_blocked();

-- Same for Request Photo.
create or replace function public.guard_photo_request_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profile_blocks
    where (blocker_profile_id = new.requester_profile_id and blocked_profile_id = new.owner_profile_id)
       or (blocker_profile_id = new.owner_profile_id and blocked_profile_id = new.requester_profile_id)
  ) then
    raise exception 'Cannot request a photo from a blocked profile';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_photo_request_not_blocked on public.photo_requests;
create trigger guard_photo_request_not_blocked
  before insert on public.photo_requests
  for each row execute function public.guard_photo_request_not_blocked();
