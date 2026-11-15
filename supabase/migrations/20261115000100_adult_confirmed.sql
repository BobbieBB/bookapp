-- Explicit works ask an 18+ question once (docs/DECISIONS.md, "Explicit works: an 18+ confirmation"). The
-- minimum age is 16 (src/lib/legal.ts), so the first time a reader opens the AO3 link or a discussion room
-- of a fic rated Explicit, the app asks whether they are 18 or over. The answer is kept on the account, as
-- a yes/no only, never a birth date.

alter table public.profiles add column adult_confirmed boolean not null default false;

-- Private, like is_admin and the terms acceptance (20261114000000_profile_privacy.sql): no column grant,
-- so other readers cannot read it, and the reader reads it through my_profile(), which returns the whole
-- row. It is not updatable through the table either: the only way to set it is confirm_adult() below.

-- The answer only ever goes from no to yes, and only by the reader: nobody, whatever their role (the
-- database owner and service_role included), says yes for someone else, starts a profile at yes, or turns
-- a yes back into a no. Errors use LV001, like the terms guard (20261103000000_terms_acceptance.sql).
create or replace function public.profiles_guard_adult()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.adult_confirmed then
      raise exception 'a new profile starts without the 18+ confirmation' using errcode = 'LV001';
    end if;
  elsif old.adult_confirmed and not new.adult_confirmed then
    raise exception 'the 18+ confirmation cannot be taken back' using errcode = 'LV001';
  elsif new.adult_confirmed and not old.adult_confirmed and auth.uid() is distinct from new.id then
    raise exception 'only the reader can say they are 18 or over' using errcode = 'LV001';
  end if;
  return new;
end $$;

create trigger profiles_guard_adult before insert or update on public.profiles
  for each row execute function public.profiles_guard_adult();

-- "I'm 18 or over, continue": the caller's own row, and only ever to yes. Saying it again is harmless.
create or replace function public.confirm_adult()
returns void
language sql security definer set search_path = public
as $$
  update public.profiles set adult_confirmed = true where id = auth.uid() and not adult_confirmed
$$;
revoke execute on function public.confirm_adult() from public, anon;
grant execute on function public.confirm_adult() to authenticated;

-- The discussion rooms of an Explicit fic need the yes (legal review, 14 Nov 2026: the 16+ age assumes
-- readers aren't discussing Explicit works). user_can_access_section is the single spoiler wall: the
-- comments read/insert policies (via can_access_discussion and can_access_section), reactions, @mentions
-- and push all go through it, so none of them can bypass this. Admins still get in through
-- can_access_section (moderation).
--
-- Split in two so the story page can tell "reached, but asks the 18+ question" from "locked":
-- user_reached_section is the reading-progress rule, unchanged from 20261016000004_home.sql.
create or replace function public.user_reached_section(p_user uuid, p_story uuid, p_kind public.discussion_kind, p_section int)
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
revoke execute on function public.user_reached_section(uuid, uuid, public.discussion_kind, int) from public, anon, authenticated;

-- Whether the 18+ question stands between this reader and the story's rooms: an Explicit fic, no yes yet.
create or replace function public.user_needs_adult(p_user uuid, p_story uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.stories s where s.id = p_story and s.content_rating = 'Explicit')
     and not exists (select 1 from public.profiles p where p.id = p_user and p.adult_confirmed)
$$;
revoke execute on function public.user_needs_adult(uuid, uuid) from public, anon, authenticated;

create or replace function public.user_can_access_section(p_user uuid, p_story uuid, p_kind public.discussion_kind, p_section int)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.user_reached_section(p_user, p_story, p_kind, p_section)
     and not public.user_needs_adult(p_user, p_story)
$$;
revoke execute on function public.user_can_access_section(uuid, uuid, public.discussion_kind, int) from public, anon, authenticated;

-- The story page's rooms follow the caller's own reading, admins included (20261115000000_rooms_follow_progress.sql).
-- A reached room of an Explicit fic stays tappable (unlocked) and says it asks the 18+ question
-- (adult_only), with no comment count until the reader says yes; admins are never asked (they moderate).
-- Otherwise unchanged; the new column changes the return type, hence the drop.
drop function public.story_rooms(uuid);
create function public.story_rooms(p_story uuid)
returns table (kind public.discussion_kind, section_number int, unlocked boolean, adult_only boolean, readers bigint, comments bigint)
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
    select r.kind, r.section_number,
      public.user_reached_section(auth.uid(), p_story, r.kind, r.section_number) as unlocked,
      not public.is_admin() and public.user_needs_adult(auth.uid(), p_story) as adult_only
    from rooms r
  )
  select
    a.kind,
    a.section_number,
    a.unlocked,
    a.adult_only,
    case when a.kind = 'epilogue'
      then (select count(*) from entries e where e.done)
      else (select count(*) from entries e where e.done or e.progress_section >= a.section_number)
    end,
    case when a.unlocked and not a.adult_only then (
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
