-- Review fixes for #78 and #79 (Yoan's #84 and #85), for databases that already ran those migrations.
-- 20261117000000_search_stories.sql and 20261117000200_story_completed_notice.sql were edited in place after the
-- PO had applied them on 19 Nov 2026; this file brings an existing database to the same state. On a new
-- database it repeats what those two files already did, so it is safe to run either way.
--
-- - search_stories: the text is cut at 200 characters.
-- - "[Fic] is complete": undo no longer deletes the notices; they show only while the fic is completed, and
--   marking it complete again adds one only for readers who never had one (mark / undo / mark can't notify
--   anyone twice). Plus an index on notifications (story_id).

create or replace function public.search_stories(p_query text)
returns table (id uuid, kind public.story_kind, title text, author_name text, fandoms text[],
               status public.story_status, language text, readers bigint, rank int)
language sql stable security definer set search_path = public as $$
  with q as (select lower(left(trim(coalesce(p_query, '')), 200)) as text),
  hits as (
    select s.id, s.kind, s.title, s.author_name, s.fandoms, s.status, s.language,
      case when lower(s.title) = q.text then 0
           when starts_with(lower(s.title), q.text) then 1
           when strpos(lower(s.title), q.text) > 0 then 2
           else 3 end as closeness
    from public.stories s, q
    where not s.is_hidden
      and char_length(q.text) >= 3
      and (strpos(lower(s.title), q.text) > 0 or strpos(lower(s.author_name), q.text) > 0)
  ), readers as (select * from public.readers_per_story()),
  ranked as (
    select h.id, h.kind, h.title, h.author_name, h.fandoms, h.status, h.language,
      coalesce(r.readers, 0) as readers,
      (row_number() over (order by h.closeness, coalesce(r.readers, 0) desc, h.title, h.id))::int as rank
    from hits h left join readers r on r.story_id = h.id
  )
  select ranked.id, ranked.kind, ranked.title, ranked.author_name, ranked.fandoms, ranked.status,
         ranked.language, ranked.readers, ranked.rank
  from ranked where ranked.rank <= 20 order by ranked.rank
$$;
revoke execute on function public.search_stories(text) from public, anon;
grant execute on function public.search_stories(text) to authenticated;

drop policy notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and (
      type::text in ('content_hidden', 'report_resolved', 'account_suspended', 'account_restored')
      or (
        type::text = 'story_completed'
        and exists (select 1 from public.stories s where s.id = notifications.story_id and not s.is_hidden and s.status = 'completed')
      )
      or (
        not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = notifications.actor_id)
        and public.can_access_discussion(discussion_id)
      )
    )
  );

create or replace function public.my_notifications_v2(p_limit int default 50, p_types public.notification_type[] default null)
returns table (
  id uuid, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_username text, story_id uuid, story_title text, story_kind public.story_kind,
  room_kind public.discussion_kind, section_number int, comment_id uuid,
  content_kind text, reason public.report_reason, outcome public.report_status,
  suspension_reason text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at, a.username, s.id, s.title, s.kind, d.kind, d.section_number, n.comment_id,
         n.content_kind, n.reason, n.outcome, x.reason
  from public.notifications n
  left join public.discussions d on d.id = n.discussion_id
  left join public.stories s on s.id = coalesce(n.story_id, d.story_id)
  left join public.profiles a on a.id = n.actor_id
  left join public.comments c on c.id = n.comment_id
  left join public.suspensions x on x.id = n.suspension_id
  where n.user_id = auth.uid()
    and (p_types is null or n.type = any (p_types))
    and (
      n.type::text in ('content_hidden', 'report_resolved', 'account_suspended', 'account_restored')
      or (n.type::text = 'story_completed' and s.id is not null and not s.is_hidden and s.status = 'completed')
      or (
        d.id is not null
        and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = n.actor_id)
        -- nothing about a comment that was deleted or hidden by moderators
        and (n.comment_id is null or (c.deleted_at is null and not c.is_hidden))
        and public.can_access_section(d.story_id, d.kind, d.section_number)
      )
    )
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke execute on function public.my_notifications_v2(int, public.notification_type[]) from public, anon;
grant execute on function public.my_notifications_v2(int, public.notification_type[]) to authenticated;

-- Notices by story: the check above, and the cascade when a story is deleted.
create index if not exists notifications_story_idx on public.notifications (story_id) where story_id is not null;

-- Sending. Any change of status counts (complete_story, an admin, or the reader who added it
-- before anyone else read it); auth.uid() is whoever made the change, and is left out.
create or replace function public.stories_completed_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'fanfic' and new.status = 'completed' and old.status is distinct from 'completed' and not new.is_hidden then
    insert into public.notifications (user_id, type, story_id)
    select le.user_id, 'story_completed', new.id
    from public.library_entries le
    where le.story_id = new.id and le.user_id is distinct from auth.uid()
      and not exists (
        select 1 from public.notifications n
        where n.user_id = le.user_id and n.story_id = new.id and n.type::text = 'story_completed'
      );
  end if;
  return null;
end $$;
revoke execute on function public.stories_completed_notice() from public, anon, authenticated;
