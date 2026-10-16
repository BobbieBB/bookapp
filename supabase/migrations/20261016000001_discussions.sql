-- Discussions on the story page (docs/DECISIONS.md, Spoiler Safe Mode).

-- ---------------------------------------------------------------------------
-- story_rooms: one row per chapter (or 25-page part) plus The Epilogue, with the caller's lock
-- state, an anonymous reader count, and the comment count only for rooms the caller has unlocked
-- (a count can hint at a twist). Counts leave out deleted and hidden comments and comments by
-- people the caller blocked, as the comments_read policy does.
-- ---------------------------------------------------------------------------
create or replace function public.story_rooms(p_story uuid)
returns table (kind public.discussion_kind, section_number int, unlocked boolean, readers bigint, comments bigint)
language sql stable security definer set search_path = public
as $$
  with story as (
    select s.* from public.stories s where s.id = p_story and (not s.is_hidden or public.is_admin())
  ), rooms as (
    select 'chapter'::public.discussion_kind as kind, n as section_number
      from story, generate_series(1, coalesce(public.section_count(story), 0)) as n
    union all
    select 'epilogue'::public.discussion_kind, null::int from story
  ), entries as (
    select le.progress_section, le.status
    from public.library_entries le
    where le.story_id = p_story and le.status in ('currently_reading', 'finished', 'dnf', 'on_hold')
  ), access as (
    select r.kind, r.section_number, public.can_access_section(p_story, r.kind, r.section_number) as unlocked
    from rooms r
  )
  select
    a.kind,
    a.section_number,
    a.unlocked,
    case when a.kind = 'epilogue'
      then (select count(*) from entries e where e.status = 'finished')
      else (select count(*) from entries e where e.status = 'finished' or e.progress_section >= a.section_number)
    end,
    case when a.unlocked then (
      select count(*)
      from public.discussions d
      join public.comments c on c.discussion_id = d.id
      where d.story_id = p_story and d.kind = a.kind and d.section_number is not distinct from a.section_number
        and c.deleted_at is null and not c.is_hidden
        and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = c.author_id)
    ) end
  from access a
  order by a.kind = 'epilogue', a.section_number
$$;

revoke execute on function public.story_rooms(uuid) from public, anon;
grant execute on function public.story_rooms(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Live comments and reactions. Supabase Realtime applies the same RLS policies, so a locked
-- chapter's comments are never pushed to a reader who hasn't reached it. (The publication only
-- exists on Supabase, not in the plain-Postgres test database.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comments, public.reactions;
  end if;
end $$;
