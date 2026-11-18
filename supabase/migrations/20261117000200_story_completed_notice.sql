-- "[Fic] is complete. The Epilogue is open." (docs/DECISIONS.md, "Finishing a WIP fic", 20 Oct 2026; Trello
-- "Известие: фикшънът е завършен, Епилогът е отворен").
-- When a reader marks a WIP fic complete, everyone else who has it in their library gets an in-app notice.
-- No push (pushes are for replies and mentions only), never to the reader who marked it, never for a hidden
-- fic. The notice names no one: it is a fact about the fic, not about who marked it. Undo (reopen_story,
-- within 7 days) hides the notices while the fic is ongoing again; marking it complete again shows them
-- again and adds one only for readers who never had one, so mark / undo / mark can't notify anyone twice. Tapping it opens the fic page; the Epilogue still opens only for
-- readers who finish (the spoiler rules don't change).

-- The shape: a story, and nothing else (no room, actor, comment, report or suspension).
alter table public.notifications
  drop constraint notifications_place,
  add constraint notifications_place check (
    discussion_id is not null or content_kind is not null or suspension_id is not null
    or (type::text = 'story_completed' and story_id is not null)
  ),
  drop constraint notifications_moderation_shape,
  add constraint notifications_moderation_shape check (
    case
      when type::text = 'content_hidden' then content_kind in ('comment', 'review') and reason is not null and outcome is null and actor_id is null and suspension_id is null
      when type::text = 'report_resolved' then content_kind is not null and outcome is not null and actor_id is null and suspension_id is null
      when type::text in ('account_suspended', 'account_restored') then suspension_id is not null and discussion_id is null and story_id is null
        and content_kind is null and reason is null and outcome is null and actor_id is null and comment_id is null
      when type::text = 'story_completed' then story_id is not null and discussion_id is null and content_kind is null
        and reason is null and outcome is null and actor_id is null and comment_id is null and suspension_id is null
      else content_kind is null and discussion_id is not null and suspension_id is null
    end
  );

-- Reading the table: as in 20261114000400_suspend.sql, plus the notice while its fic is not hidden.
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

-- my_notifications_v2 as in 20261114000400_suspend.sql (same columns, so replaced in place), plus the notice
-- while its fic is not hidden. my_notifications (older builds) is untouched and never returns it.
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

create trigger stories_completed_notice after update of status on public.stories
  for each row execute function public.stories_completed_notice();
