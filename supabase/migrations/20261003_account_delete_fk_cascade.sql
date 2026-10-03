-- Account delete ab tak kabhi-kabhi FK violation se fail ho sakta tha:
-- share_links.profile_id aur caste_suggestions.submitted_by_profile_id
-- "ON DELETE NO ACTION" the, aur in dono tables pe normal user ke paas
-- DELETE policy nahi hai — sirf staff/admin ke paas. Share links already
-- 14 rows mein hain (Admin ke "Share Links" tool se banti hain), isliye
-- jis bhi profile ka share link ban chuka hai, uska self-delete FK error
-- se fail ho jaata.
--
-- Profile delete hote hi uske share links aur caste suggestions ka koi
-- matlab nahi rehta, isliye CASCADE sahi behavior hai.

alter table public.share_links drop constraint share_links_profile_id_fkey;
alter table public.share_links add constraint share_links_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.caste_suggestions drop constraint caste_suggestions_submitted_by_profile_id_fkey;
alter table public.caste_suggestions add constraint caste_suggestions_submitted_by_profile_id_fkey
  foreign key (submitted_by_profile_id) references public.profiles(id) on delete cascade;

alter table public.subscriptions drop constraint subscriptions_profile_id_fkey;
alter table public.subscriptions add constraint subscriptions_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;
