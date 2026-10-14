-- Security and logic fixes found in the 14 Oct 2026 review.
-- Each block names the problem it closes; the matching regression tests are in
-- supabase/tests/spoiler_rules.test.sql, section 11.

-- ---------------------------------------------------------------------------
-- Sane limits and valid links (unbounded progress froze section_reader_counts;
-- any URL was accepted as a fic link or a cover)
-- ---------------------------------------------------------------------------

alter table public.stories
  add constraint sections_sane check (
    coalesce(published_sections, 0) <= 5000 and coalesce(total_sections, 0) <= 5000
    and coalesce(page_count, 0) <= 50000
  ),
  -- One canonical form per work, so the same fic cannot be added twice with another URL
  -- (the app normalises pasted links to this form).
  add constraint fanfic_ao3_work_link check (
    kind <> 'fanfic' or source_url ~ '^https://archiveofourown\.org/works/[0-9]+$'
  ),
  add constraint source_url_https check (source_url is null or source_url ~ '^https://'),
  -- Covers come from Open Library only; custom covers are private (Storage), never here.
  add constraint cover_from_open_library check (
    cover_url is null or cover_url ~ '^https://covers\.openlibrary\.org/'
  ),
  -- An unknown status used to count as "completed" and opened every chapter.
  add constraint fanfic_status_known check (kind <> 'fanfic' or status is not null);

alter table public.library_entries
  add constraint progress_sane check (progress_section <= 5000 and coalesce(progress_page, 0) <= 50000);

-- "Alice" next to "alice" made impersonation easy.
create unique index profiles_username_lower_uniq on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Stories: the creator can no longer reshape a story other readers depend on
-- (changing kind exposed private fic ratings; changing pages/chapters/status
-- moved discussions and leaked spoilers)
-- ---------------------------------------------------------------------------

create or replace function public.story_has_other_readers(p_story uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.library_entries where story_id = p_story and user_id <> auth.uid())
$$;

-- Not security definer on purpose: current_user is 'authenticated' only for direct
-- client updates. Trusted functions such as bump_published_sections run as the owner.
create or replace function public.stories_guard_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' or public.is_admin() then
    return new;
  end if;
  if new.kind <> old.kind or new.source <> old.source
     or new.source_id is distinct from old.source_id
     or new.source_url is distinct from old.source_url then
    raise exception 'the type and source of a story cannot be changed';
  end if;
  if public.story_has_other_readers(old.id) then
    raise exception 'other readers have this story, so only moderators can edit it';
  end if;
  return new;
end $$;

create trigger stories_guard_update before update on public.stories
  for each row execute function public.stories_guard_update();

-- New WIP chapters: fanfiction that is ongoing only, only upwards, within the limits.
-- (It used to work on any story, so a stranger could shrink a 20-chapter book to 1.)
create or replace function public.bump_published_sections(p_story uuid, p_count int)
returns public.stories
language plpgsql security definer set search_path = public
as $$
declare
  s public.stories;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.stories where id = p_story;
  if s.id is null or s.is_hidden or s.kind <> 'fanfic' or s.status is distinct from 'ongoing'
     or p_count is null or p_count > 5000
     or (s.total_sections is not null and p_count > s.total_sections) then
    raise exception 'cannot update chapters for this story';
  end if;
  if p_count <= coalesce(s.published_sections, 0) then
    return s;  -- never goes down
  end if;
  update public.stories set published_sections = p_count, updated_at = now()
   where id = p_story returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- Spoiler wall: The Epilogue stays closed while a fic is still ongoing
-- (readers who "finished" at different chapters were sharing one room)
-- ---------------------------------------------------------------------------

create or replace function public.can_access_section(p_story uuid, p_kind public.discussion_kind, p_section int)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.library_entries le
      join public.stories s on s.id = le.story_id
      where le.user_id = auth.uid()
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

-- Discussions only for chapters that exist (any number used to create a row).
create or replace function public.open_discussion(p_story uuid, p_kind public.discussion_kind, p_section int default null)
returns public.discussions
language plpgsql security definer set search_path = public
as $$
declare
  d public.discussions;
  n int;
begin
  if not public.can_access_section(p_story, p_kind, p_section) then
    raise exception 'locked: finish this chapter to join the discussion' using errcode = '42501';
  end if;

  if p_kind = 'chapter' then
    select public.section_count(s) into n from public.stories s where s.id = p_story;
    if p_section is null or p_section < 1 or p_section > coalesce(n, 5000) then
      raise exception 'this story has no chapter %', p_section;
    end if;
  end if;

  if p_kind = 'epilogue' then
    select * into d from public.discussions where story_id = p_story and kind = 'epilogue';
  else
    select * into d from public.discussions where story_id = p_story and kind = 'chapter' and section_number = p_section;
  end if;

  if d.id is null then
    insert into public.discussions (story_id, kind, section_number)
    values (p_story, p_kind, case when p_kind = 'chapter' then p_section end)
    on conflict do nothing
    returning * into d;
    if d.id is null then  -- created concurrently
      return public.open_discussion(p_story, p_kind, p_section);
    end if;
  end if;
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

-- Deleting a comment now erases its text (it stayed readable), and deleted comments
-- cannot be edited or restored.
create or replace function public.comments_guard_update()
returns trigger language plpgsql as $$
begin
  if new.discussion_id <> old.discussion_id or new.author_id <> old.author_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'only the comment body can be changed';
  end if;
  if new.is_hidden <> old.is_hidden and not public.is_admin() then
    raise exception 'only moderators can hide comments';
  end if;
  if old.deleted_at is not null then
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

-- Replies are one level deep.
create or replace function public.comments_check_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.comments;
begin
  if new.parent_id is not null then
    select * into p from public.comments where id = new.parent_id;
    if p.discussion_id <> new.discussion_id then
      raise exception 'a reply must be in the same discussion as its parent';
    end if;
    if p.parent_id is not null then
      raise exception 'replies are one level deep: reply to the first comment instead';
    end if;
  end if;
  return new;
end $$;

-- Suspended users can no longer edit their comments and reviews.
drop policy comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (author_id = auth.uid() and public.is_active_user()));

drop policy reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (user_id = auth.uid() and not is_hidden and public.is_active_user()));

-- ---------------------------------------------------------------------------
-- Helper functions no longer answer questions about other people
-- ---------------------------------------------------------------------------

-- Block lists are private: you can only ask about blocks that involve you.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (a, b))
    and exists (
      select 1 from public.blocks
      where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    )
$$;

-- Only reveals the author of comments in discussions you have unlocked.
create or replace function public.comment_author_of(p_comment uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.author_id from public.comments c
  where c.id = p_comment and public.can_access_discussion(c.discussion_id)
$$;

-- ---------------------------------------------------------------------------
-- Notifications: one reaction notification per person per comment
-- (toggling a reaction sent a new notification every time)
-- ---------------------------------------------------------------------------

create or replace function public.reactions_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = new.comment_id;
  if c.author_id <> new.user_id
     and not public.is_blocked_between(c.author_id, new.user_id)
     and not exists (
       select 1 from public.notifications n
       where n.user_id = c.author_id and n.type = 'reaction' and n.actor_id = new.user_id and n.comment_id = c.id
     ) then
    insert into public.notifications (user_id, type, actor_id, discussion_id, comment_id)
    values (c.author_id, 'reaction', new.user_id, c.discussion_id, c.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- New functions start with EXECUTE for everyone; keep the original lockdown.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
