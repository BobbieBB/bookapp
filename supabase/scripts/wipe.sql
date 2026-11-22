-- Livami: before the closed test, step 2 of 2 (PO, 21 Nov 2026). DELETES FOR GOOD, no undo.
-- Run wipe-preview.sql first and check the numbers.
-- Keeps: admin accounts (profiles.is_admin = true), their profiles, push settings and analytics
-- consent; the app's own lists (starter fandoms, ship nicknames, settings).
-- Deletes: every other account, and all content: stories, libraries, discussions, comments,
-- reactions, reviews, ratings, reports, feedback, notifications, analytics events, blocks,
-- suspensions, requests, the moderation e-mail log.
-- Custom cover IMAGES live in Storage: empty the "covers" bucket in the dashboard by hand.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where is_admin) then
    raise exception 'No admin account found: stopping, so that no one is left without access.';
  end if;
end $$;

-- Stories take their discussions, comments, reactions, library entries, custom cover rows,
-- ratings, reviews, reports and notifications with them.
delete from public.stories;
delete from public.removal_requests;
delete from public.chapter_count_requests;
delete from public.reports;
delete from public.moderation_email_log;
delete from public.feedback;
delete from public.notifications;
delete from public.suspensions;
delete from public.blocks;
delete from public.analytics_events;
-- Every account but the admins; their profiles, tokens and consents go with them.
delete from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id and p.is_admin);

commit;

select 'Accounts left' as what, count(*) as how_many from auth.users
union all select 'Stories left', count(*) from public.stories
union all select 'Comments left', count(*) from public.comments;
