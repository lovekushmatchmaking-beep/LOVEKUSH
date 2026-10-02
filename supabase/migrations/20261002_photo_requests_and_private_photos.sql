-- Request-to-view-photo: kisi bhi member ki photo by default hidden rehti
-- hai; sirf owner ke Approve karne par us ek requester ko dikhti hai.
-- Owner kabhi bhi "Hide again" karke access wapas le sakta hai.
--
-- Pehle: storage pe "Anyone can view photos" (bucket-wide) aur photos table
-- pe "anyone can view photos of active profiles" policies thi — yaani app
-- mein blur sirf CSS tha, asli photo URL koi bhi bana sakta tha. Yeh
-- migration dono ko owner / staff / approved-requester tak seemit karti hai.

create table if not exists public.photo_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_profile_id, owner_profile_id),
  check (requester_profile_id <> owner_profile_id)
);
create index if not exists photo_requests_owner_idx on public.photo_requests(owner_profile_id);

alter table public.photo_requests enable row level security;

create policy "parties read own photo requests" on public.photo_requests for select
  using (
    requester_profile_id in (select id from public.profiles where user_id = auth.uid())
    or owner_profile_id in (select id from public.profiles where user_id = auth.uid())
    or public.is_staff_member(auth.uid())
  );

create policy "requester sends pending photo request" on public.photo_requests for insert
  with check (
    requester_profile_id in (select id from public.profiles where user_id = auth.uid())
    and status = 'pending'
  );

create policy "owner approves or declines photo request" on public.photo_requests for update
  using (owner_profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (
    owner_profile_id in (select id from public.profiles where user_id = auth.uid())
    and status in ('approved','declined')
  );

create policy "staff manage photo requests" on public.photo_requests for all
  using (public.is_staff_member(auth.uid()));

-- Owner sirf status/responded_at badal sake (requester/owner id nahi).
revoke update on public.photo_requests from anon, authenticated;
grant select, insert on public.photo_requests to authenticated;
grant update (status, responded_at) on public.photo_requests to authenticated;

-- Kaun is profile ki photos dekh sakta hai: owner khud, staff, ya approved requester.
create or replace function public.can_view_profile_photos(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from profiles where id = p_owner and user_id = auth.uid())
    or is_staff_member(auth.uid())
    or exists (
      select 1 from photo_requests r join profiles me on me.id = r.requester_profile_id
      where r.owner_profile_id = p_owner and r.status = 'approved' and me.user_id = auth.uid()
    );
$$;

create or replace function public.can_view_photo_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where ph.storage_path = p_name and can_view_profile_photos(ph.profile_id)
  );
$$;

-- photos table: active profiles ki photos ab sirf approved requesters ko.
drop policy if exists "anyone can view photos of active profiles" on public.photos;
create policy "approved requesters can view photos of active profiles" on public.photos for select
  using (
    profile_id in (select id from public.profiles where profile_status = 'active')
    and public.can_view_profile_photos(profile_id)
  );

-- storage: bucket-wide read hata ke wahi rule file level pe. Owner ki apni
-- photos ("users can view own photos") aur staff policies waise hi rehti hain.
drop policy if exists "Anyone can view photos" on storage.objects;
drop policy if exists "users can view photos of active profiles" on storage.objects;
create policy "owner staff or approved requester can view photos" on storage.objects for select
  using (bucket_id = 'lovekush-photos' and public.can_view_photo_object(name));
