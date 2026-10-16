-- Home: replies and @mentions to you, and "N new comments in chapter X" (docs/DECISIONS.md, Home;
-- Spoiler Safe Mode 5: notifications follow the same rule and never contain comment text).

alter type public.notification_type add value if not exists 'mention';

-- ---------------------------------------------------------------------------
-- The spoiler wall for any reader (needed to decide whether a mentioned reader may be told).
-- can_access_section stays the single rule for the signed-in reader and now delegates here.
-- ---------------------------------------------------------------------------
create or replace function public.user_can_access_section(p_user uuid, p_story uuid, p_kind public.discussion_kind, p_section int)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.library_entries le
    join public.stories s on s.id = le.story_id
    where le.user_id = p_user
      and le.story_id = p_story
      and not s.is_hidden
      and (
        -- The Epilogue: the whole story is Finished, and the story itself is complete
        (p_kind = 'epilogue' and le.status = 'finished' and s.status is distinct from 'ongoing')
        -- Chapter N: the reader fully finished chapter N. "Finished" opens every chapter only
        -- for completed stories; on a WIP fic, a new chapter stays locked until it is read.
        or (p_kind = 'chapter' and (
              le.progress_section >= p_section
              or (le.status = 'finished' and s.status is distinct from 'ongoing')
           ))
      )
  )
$$;
-- Not for readers: it would answer questions about other people's progress.
revoke execute on function public.user_can_access_section(uuid, uuid, public.discussion_kind, int) from public, anon, authenticated;

create or replace function public.can_access_section(p_story uuid, p_kind public.discussion_kind, p_section int)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or public.user_can_access_section(auth.uid(), p_story, p_kind, p_section)
$$;

-- ---------------------------------------------------------------------------
-- @mentions: "@name" (any capitals) notifies that reader, at most 10 per comment, only if they can
-- open the room, never yourself, not between blocked readers, not someone who muted the room, and
-- not the person already getting a reply notification for this comment.
-- ---------------------------------------------------------------------------
create or replace function public.comments_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d public.discussions;
  parent_author uuid;
begin
  select * into d from public.discussions where id = new.discussion_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
  end if;

  insert into public.notifications (user_id, type, actor_id, discussion_id, comment_id)
  select p.id, 'mention', new.author_id, new.discussion_id, new.id
  from (
    select distinct lower(m[1]) as name
    from regexp_matches(new.body, '@([A-Za-z0-9_]{3,30})', 'g') as m
    limit 10
  ) mentioned
  join public.profiles p on lower(p.username) = mentioned.name
  where p.id <> new.author_id
    and p.id is distinct from parent_author
    and not public.is_blocked_between(p.id, new.author_id)
    and not exists (
      select 1 from public.discussion_follows f where f.user_id = p.id and f.discussion_id = new.discussion_id and f.muted
    )
    and public.user_can_access_section(p.id, d.story_id, d.kind, d.section_number);
  return new;
end $$;

create trigger comments_notify_mentions after insert on public.comments
  for each row execute function public.comments_notify_mentions();

-- ---------------------------------------------------------------------------
-- Your notifications as the app shows them: who, which story and room, never the comment text,
-- and only for rooms you can open now (moving progress back hides them again).
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(p_limit int default 50, p_types public.notification_type[] default null)
returns table (
  id uuid, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_username text, story_id uuid, story_title text, story_kind public.story_kind,
  room_kind public.discussion_kind, section_number int, comment_id uuid
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at, a.username, s.id, s.title, s.kind, d.kind, d.section_number, n.comment_id
  from public.notifications n
  join public.discussions d on d.id = n.discussion_id
  join public.stories s on s.id = d.story_id
  left join public.profiles a on a.id = n.actor_id
  left join public.comments c on c.id = n.comment_id
  where n.user_id = auth.uid()
    and (p_types is null or n.type = any (p_types))
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = n.actor_id)
    -- nothing about a comment that was deleted or hidden by moderators
    and (n.comment_id is null or (c.deleted_at is null and not c.is_hidden))
    and public.can_access_section(d.story_id, d.kind, d.section_number)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- Marks read what you have seen: everything up to the newest notification you were shown.
create or replace function public.mark_notifications_read(p_until timestamptz)
returns void language sql security invoker set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and created_at <= p_until
$$;

-- The table itself follows the same rule as my_notifications: only rooms you can open now.
drop policy notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = notifications.actor_id)
    and public.can_access_discussion(discussion_id)
  );

-- A reader can post at most 30 comments in 10 minutes (and so mention at most 300 people).
create constraint trigger comments_rate after insert on public.comments
  for each row execute function public.limit_rate('author_id', '30', '10 minutes');

-- ---------------------------------------------------------------------------
-- Continue Reading: new comments in your latest finished chapter since you last read it (not your
-- own, not from people you blocked). Only chapters you have unlocked, so Home never shows anything
-- from a chapter you haven't reached.
-- ---------------------------------------------------------------------------
create or replace function public.continue_reading_hints()
returns table (story_id uuid, section_number int, new_comments bigint)
language sql stable security definer set search_path = public as $$
  select le.story_id, le.progress_section, count(c.id)
  from public.library_entries le
  join public.stories s on s.id = le.story_id and not s.is_hidden
  left join public.discussions d on d.story_id = le.story_id and d.kind = 'chapter' and d.section_number = le.progress_section
  left join public.discussion_follows f on f.discussion_id = d.id and f.user_id = le.user_id
  left join public.comments c on c.discussion_id = d.id
    and c.created_at > coalesce(f.last_read_at, '-infinity'::timestamptz)
    and c.author_id <> le.user_id and c.deleted_at is null and not c.is_hidden
    and not exists (select 1 from public.blocks b where b.blocker_id = le.user_id and b.blocked_id = c.author_id)
  where le.user_id = auth.uid() and le.status = 'currently_reading' and le.progress_section >= 1
  group by le.story_id, le.progress_section
$$;

revoke execute on function public.my_notifications(int, public.notification_type[]), public.mark_notifications_read(timestamptz),
  public.continue_reading_hints() from public, anon;
grant execute on function public.my_notifications(int, public.notification_type[]), public.mark_notifications_read(timestamptz),
  public.continue_reading_hints() to authenticated;
