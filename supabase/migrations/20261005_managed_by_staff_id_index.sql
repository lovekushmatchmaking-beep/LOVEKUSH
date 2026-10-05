-- Follow-up to the 2026-10-04 scale/perf audit (idx_profiles_* in
-- 20261004_profile_indexes_and_match_candidates_rpc.sql): that pass added
-- B-tree indexes on gender/profile_status/religion/community/city/
-- created_at, but missed `managed_by_staff_id` — filtered on directly by
-- the admin's "Assigned to me" filter (Admin.js: .eq('managed_by_staff_id',
-- staffUser.user_id)) and by the My Queue / Team-workload per-staff counts.
-- Zero-risk, same as the earlier batch: only adds an index, no behavior change.
create index if not exists idx_profiles_managed_by_staff_id on public.profiles (managed_by_staff_id);
