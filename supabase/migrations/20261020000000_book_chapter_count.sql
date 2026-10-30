-- A book added as "Want to read" may not have its chapter count yet (the reader hasn't opened it).
-- The first reader who has it in their library sets it once, later; after that only moderators
-- change it (stories_guard_update). PO, phone test 20 Oct 2026.
create or replace function public.set_book_chapter_count(p_story uuid, p_count int)
returns public.stories
language plpgsql security definer set search_path = public
as $$
declare
  s public.stories;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'chapters must be between 1 and 5000';
  end if;
  update public.stories
     set total_sections = p_count, updated_at = now()
   where id = p_story
     and kind = 'book' and has_chapters and not is_hidden
     and total_sections is null and published_sections is null
     and exists (select 1 from public.library_entries le where le.story_id = p_story and le.user_id = auth.uid())
  returning * into s;
  if s.id is null then
    raise exception 'cannot set the chapter count for this story';
  end if;
  return s;
end $$;

revoke execute on function public.set_book_chapter_count(uuid, int) from public, anon;
grant execute on function public.set_book_chapter_count(uuid, int) to authenticated;
