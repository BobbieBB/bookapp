-- The story page's rooms follow the caller's own reading, admins included (PO testing, 15 Nov 2026).
-- story_rooms used can_access_section, which lets admins into every room so they can moderate. On the
-- story page that showed an admin every chapter and The Epilogue as open, whatever they had read, a
-- spoiler on their own book. The list now asks user_can_access_section for the caller; admins still
-- open any room from the Moderation screen (open_discussion and the comment policies keep the admin
-- bypass). Same shape and counts as before (20261016000001_discussions.sql).
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
    -- Counted only where can_access_section would let them in: "Finished" opens every chapter
    -- and The Epilogue only once the story is no longer ongoing.
    select le.progress_section, le.status = 'finished' and story.status is distinct from 'ongoing' as done
    from public.library_entries le, story
    where le.story_id = p_story and le.status in ('currently_reading', 'finished', 'dnf', 'on_hold')
  ), access as (
    select r.kind, r.section_number, public.user_can_access_section(auth.uid(), p_story, r.kind, r.section_number) as unlocked
    from rooms r
  )
  select
    a.kind,
    a.section_number,
    a.unlocked,
    case when a.kind = 'epilogue'
      then (select count(*) from entries e where e.done)
      else (select count(*) from entries e where e.done or e.progress_section >= a.section_number)
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
