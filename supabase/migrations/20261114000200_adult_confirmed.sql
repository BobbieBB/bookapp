-- Explicit works behind an 18+ yes/no (docs/DECISIONS.md, "Explicit works: an 18+ yes/no"). The
-- minimum age is 16 (src/lib/legal.ts), so the app hides the AO3 link and archive warnings of a fic
-- rated Explicit until the reader says they are 18 or over. Stored as a yes/no only, never a birth date.

alter table public.profiles add column adult_confirmed boolean not null default false;

-- The answer is the reader's alone: they can say yes and take it back, and nobody else can do
-- either, whatever their role (the database owner and service_role included). The update-own RLS
-- policy keeps other readers off the row; this guard covers everyone without the reader's session.
-- Errors use LV001, like the terms guard (20261103000000_terms_acceptance.sql).
create or replace function public.profiles_guard_adult()
returns trigger language plpgsql as $$
begin
  if (case when tg_op = 'INSERT' then new.adult_confirmed else new.adult_confirmed is distinct from old.adult_confirmed end)
     and auth.uid() is distinct from new.id then
    raise exception 'only the reader can say they are 18 or over' using errcode = 'LV001';
  end if;
  return new;
end $$;

create trigger profiles_guard_adult before insert or update on public.profiles
  for each row execute function public.profiles_guard_adult();

grant update (adult_confirmed) on public.profiles to authenticated;

-- The discussion rooms of an Explicit fic are behind the same yes/no (legal review, 14 Nov 2026: the
-- 16+ age assumes readers aren't discussing Explicit works). user_can_access_section is the single
-- spoiler wall: the comments read/insert policies (via can_access_discussion and can_access_section),
-- reactions, room counts, @mentions and push all go through it, so none of them can bypass this.
-- Unchanged from 20261016000004_home.sql except the rating condition. Admins still get in through
-- can_access_section (moderation).
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
      -- Explicit: only for a reader who said they are 18 or over.
      and (s.content_rating is distinct from 'Explicit'
           or exists (select 1 from public.profiles p where p.id = p_user and p.adult_confirmed))
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
revoke execute on function public.user_can_access_section(uuid, uuid, public.discussion_kind, int) from public, anon, authenticated;
