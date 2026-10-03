-- Received interests: jis member ko kisi ne Like / Super Like kiya, woh
-- us row ko padh sake.
--
-- Pehle: match_actions pe sirf "user reads own actions" (actor) aur staff
-- ki SELECT policy thi. Dashboard target_profile_id = me wali query chalata
-- hai (Notifications → Received, Accepted = mutual like, bell dot), lekin
-- RLS us query ko hamesha khaali lauta deta tha — kisi ko pata hi nahi
-- chalta tha ki use kisne like kiya.
--
-- Pass (dislike) private hi rehta hai: sirf like / super_like dikhte hain.

create policy "target reads likes received" on public.match_actions for select
  using (
    action in ('like', 'super_like')
    and target_profile_id in (select id from public.profiles where user_id = auth.uid())
  );
