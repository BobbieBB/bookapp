-- Livami: before the closed test, step 1 of 2. READ ONLY: shows what wipe.sql would delete.
-- Run in the Supabase SQL Editor. Nothing changes.
-- Kept: every admin account (profiles.is_admin = true) and its profile. Everything else goes.
select 'Accounts kept (admins)' as what, string_agg(username, ', ') as how_many from public.profiles where is_admin
union all select 'Accounts deleted', count(*)::text from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id and p.is_admin)
union all select 'Stories (books and fics)', count(*)::text from public.stories
union all select 'Library entries', count(*)::text from public.library_entries
union all select 'Comments', count(*)::text from public.comments
union all select 'Reviews', count(*)::text from public.reviews
union all select 'Ratings', count(*)::text from public.ratings
union all select 'Reports', count(*)::text from public.reports
union all select 'Feedback', count(*)::text from public.feedback
union all select 'Notifications', count(*)::text from public.notifications
union all select 'Analytics events', count(*)::text from public.analytics_events
union all select 'Custom covers (rows)', count(*)::text from public.custom_covers;
