-- Moderation notices (EU Digital Services Act arts. 16(5) and 17; docs/DECISIONS.md, Moderation notices).
-- Hiding a comment or review tells its author why (the report reason is the statement of reasons), and
-- resolving a report tells each reporter what was decided. Both are written by moderation_resolve in the
-- same transaction as the decision, so a notice cannot be lost. They are system notices: they never name
-- the reporter or the reported reader (actor_id stays empty), they are sent across blocks, and they never
-- buzz a phone (notifications_send_push and send_held_pushes only push replies and mentions).
--
-- A fic hidden on an author's removal request tells nobody: the author wrote in from outside the app and
-- has no account, and the readers who added the fic are not the affected content's provider.

alter type public.notification_type add value if not exists 'content_hidden';
alter type public.notification_type add value if not exists 'report_resolved';

-- A notice about a review or a reader has no room, so discussion_id may be empty for these; it still
-- names the room for a comment (story and chapter). Enum values are compared as text here and below:
-- a value added in this migration cannot be used as a literal in the same transaction.
alter table public.notifications
  alter column discussion_id drop not null,
  add column story_id     uuid references public.stories (id) on delete cascade,
  add column content_kind text check (content_kind in ('comment', 'review', 'reader')),
  add column reason       public.report_reason,
  add column outcome      public.report_status check (outcome is distinct from 'open'),
  add constraint notifications_place check (discussion_id is not null or content_kind is not null),
  add constraint notifications_moderation_shape check (
    case
      when type::text = 'content_hidden' then content_kind in ('comment', 'review') and reason is not null and outcome is null and actor_id is null
      when type::text = 'report_resolved' then content_kind is not null and outcome is not null and actor_id is null
      else content_kind is null and discussion_id is not null
    end
  );

-- ---------------------------------------------------------------------------
-- A moderator may hide a comment its author already deleted (before, "deleted comments cannot be
-- changed" made a report on one impossible to action, only to dismiss). Only is_hidden may change;
-- otherwise as in 20261019000000_delete_account.sql.
-- ---------------------------------------------------------------------------
create or replace function public.comments_guard_update()
returns trigger language plpgsql as $$
begin
  if old.author_id is not null and new.author_id is null
     and not exists (select 1 from public.profiles where id = old.author_id) then
    if (new.discussion_id, new.parent_id, new.body, new.created_at, new.edited_at, new.deleted_at, new.is_hidden)
       is distinct from (old.discussion_id, old.parent_id, old.body, old.created_at, old.edited_at, old.deleted_at, old.is_hidden) then
      raise exception 'only the author can be removed from a comment when their account is deleted';
    end if;
    return new;
  end if;
  if new.discussion_id <> old.discussion_id or new.author_id is distinct from old.author_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'only the comment body can be changed';
  end if;
  if new.is_hidden <> old.is_hidden and not public.is_admin() then
    raise exception 'only moderators can hide comments';
  end if;
  if old.deleted_at is not null then
    if new.is_hidden and not old.is_hidden
       and (new.body, new.edited_at, new.deleted_at) is not distinct from (old.body, old.edited_at, old.deleted_at) then
      return new; -- a moderator hiding it (is_admin was checked above)
    end if;
    raise exception 'deleted comments cannot be changed';
  end if;
  if new.deleted_at is not null then
    new.body := '[deleted]';
    new.edited_at := old.edited_at;
  elsif new.body <> old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- moderation_resolve: as in 20261102000000_moderation.sql, plus the notices for comment, review and
-- reader reports. Each report closed by the decision tells its own reporter (several reports on one
-- item: one notice each).
-- ---------------------------------------------------------------------------
create or replace function public.moderation_resolve(p_kind text, p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  outcome constant public.report_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;
  rep public.reports;
  rem public.removal_requests;
  req public.chapter_count_requests;
  fb public.feedback;
  s public.stories;
  matched uuid;
  target_kind text;
  target_story uuid;
  target_room uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can resolve moderation items' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('comment_report', 'review_report', 'user_report', 'removal_request', 'chapter_count', 'feedback') then
    raise exception 'unknown moderation kind: %', coalesce(p_kind, '<none>') using errcode = '22023';
  end if;
  if p_action is null or not (p_action = any (case p_kind
       when 'comment_report' then array['hide', 'dismiss']
       when 'review_report' then array['hide', 'dismiss']
       when 'user_report' then array['dismiss']
       when 'removal_request' then array['hide', 'dismiss']
       when 'chapter_count' then array['accept', 'dismiss']
       else array['done', 'dismiss'] end)) then
    raise exception '% cannot be %', p_kind, coalesce(p_action, '<none>') using errcode = '22023';
  end if;

  if p_kind in ('comment_report', 'review_report', 'user_report') then
    select * into rep from public.reports
     where id = p_id
       and case p_kind when 'comment_report' then comment_id is not null
                       when 'review_report' then review_id is not null
                       else reported_user_id is not null end
     for update;
    if rep.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rep.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;

    -- Where the reported thing lives, for both notices: the comment's story and room, the review's story.
    if p_kind = 'comment_report' then
      target_kind := 'comment';
      select c.discussion_id, d.story_id into target_room, target_story
        from public.comments c join public.discussions d on d.id = c.discussion_id where c.id = rep.comment_id;
    elsif p_kind = 'review_report' then
      target_kind := 'review';
      select v.story_id into target_story from public.reviews v where v.id = rep.review_id;
    else
      target_kind := 'reader';
    end if;

    if p_action = 'hide' then
      -- The author is told once, when the item is actually hidden (not again if it already was), and not
      -- about a comment they had deleted themselves (it is still hidden, in case it is ever restored).
      if p_kind = 'comment_report' then
        with h as (update public.comments set is_hidden = true where id = rep.comment_id and not is_hidden returning author_id, deleted_at)
        insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, reason)
        select h.author_id, 'content_hidden', target_room, target_story, target_kind, rep.reason
        from h where h.author_id is not null and h.deleted_at is null;
      else
        with h as (update public.reviews set is_hidden = true where id = rep.review_id and not is_hidden returning user_id)
        insert into public.notifications (user_id, type, story_id, content_kind, reason)
        select h.user_id, 'content_hidden', target_story, target_kind, rep.reason from h;
      end if;
      with closed as (
        update public.reports set status = 'actioned'
         where status = 'open'
           and case p_kind when 'comment_report' then comment_id = rep.comment_id else review_id = rep.review_id end
        returning reporter_id
      )
      insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, outcome)
      select reporter_id, 'report_resolved', target_room, target_story, target_kind, 'actioned' from closed;
    else
      update public.reports set status = outcome where id = rep.id;
      insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, outcome)
      values (rep.reporter_id, 'report_resolved', target_room, target_story, target_kind, outcome);
    end if;

  elsif p_kind = 'removal_request' then
    select * into rem from public.removal_requests where id = p_id for update;
    if rem.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rem.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'hide' then
      matched := rem.story_id;
      if matched is null then
        select id into matched from public.stories where lower(source_url) = lower(rem.story_url);
      end if;
      if matched is null then
        raise exception 'no fic in the app matches this link: dismiss the request' using errcode = 'MD001';
      end if;
      update public.stories set is_hidden = true, updated_at = now() where id = matched;
      update public.removal_requests set story_id = matched, status = 'actioned' where id = rem.id;
    else
      update public.removal_requests set status = 'dismissed' where id = rem.id;
    end if;

  elsif p_kind = 'chapter_count' then
    select * into req from public.chapter_count_requests where id = p_id for update;
    if req.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if req.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'accept' then
      select * into s from public.stories where id = req.story_id for update;
      if s.kind <> 'book' or not s.has_chapters or s.total_sections is null
         or (s.published_sections is not null and req.proposed < s.published_sections) then
        raise exception 'this book cannot take that chapter count' using errcode = 'MD002';
      end if;
      update public.stories set total_sections = req.proposed, updated_at = now() where id = s.id;
      update public.library_entries
         set progress_section = case when status = 'finished' then req.proposed else least(progress_section, req.proposed) end
       where story_id = s.id
         and ((status = 'finished' and progress_section <> req.proposed) or progress_section > req.proposed);
      -- the same proposal from other readers is answered too; different ones stay for a moderator
      update public.chapter_count_requests set status = 'actioned'
       where story_id = s.id and status = 'open' and proposed = req.proposed;
    else
      update public.chapter_count_requests set status = 'dismissed' where id = req.id;
    end if;

  else
    select * into fb from public.feedback where id = p_id for update;
    if fb.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if fb.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    update public.feedback set status = outcome where id = fb.id;
  end if;
end $$;

revoke execute on function public.moderation_resolve(text, uuid, text) from public, anon;
grant execute on function public.moderation_resolve(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading notifications. App builds from before this migration call my_notifications(p_types => null)
-- and cannot render a kind they don't know, so my_notifications keeps its columns and returns only the
-- kinds it always did (reply, mention, reaction), whatever kinds are added later.
--
-- my_notifications_v2(p_limit, p_types) is what the app calls from now on: every kind, plus the columns
-- for system notices (content_kind, reason, outcome; story_id without a room). New notification kinds
-- (e.g. account notices) go here, with their own columns added to its result. Social kinds keep their
-- rule (only rooms you can open now, nothing about a hidden or deleted comment, nothing from someone you
-- blocked); a system notice is always shown: it names no one and never carries comment text.
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
    and n.type::text in ('reply', 'mention', 'reaction')
    and (p_types is null or n.type = any (p_types))
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = n.actor_id)
    and (n.comment_id is null or (c.deleted_at is null and not c.is_hidden))
    and public.can_access_section(d.story_id, d.kind, d.section_number)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create function public.my_notifications_v2(p_limit int default 50, p_types public.notification_type[] default null)
returns table (
  id uuid, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_username text, story_id uuid, story_title text, story_kind public.story_kind,
  room_kind public.discussion_kind, section_number int, comment_id uuid,
  content_kind text, reason public.report_reason, outcome public.report_status
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at, a.username, s.id, s.title, s.kind, d.kind, d.section_number, n.comment_id,
         n.content_kind, n.reason, n.outcome
  from public.notifications n
  left join public.discussions d on d.id = n.discussion_id
  left join public.stories s on s.id = coalesce(n.story_id, d.story_id)
  left join public.profiles a on a.id = n.actor_id
  left join public.comments c on c.id = n.comment_id
  where n.user_id = auth.uid()
    and (p_types is null or n.type = any (p_types))
    and (
      n.type::text in ('content_hidden', 'report_resolved')
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

-- The table follows the same rule.
drop policy notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and (
      type::text in ('content_hidden', 'report_resolved')
      or (
        not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = notifications.actor_id)
        and public.can_access_discussion(discussion_id)
      )
    )
  );
