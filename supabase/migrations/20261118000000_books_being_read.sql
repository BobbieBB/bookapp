-- Discover for books (PO testing round on iPhone, 15 Nov 2026, decision F): "Being read now", one list, no genres
-- yet. Books readers have in their libraries that you don't have yet:
--   1. tier 'reading': someone is reading it now (status currently_reading);
--   2. tier 'readers': otherwise the most read, so the list is empty only when every book is already yours.
-- Within a tier, editions in the reader's language (p_language, the app's UI language) come first, then the most
-- readers, then the newest. Hidden books never show. Counts come only through this function: libraries stay private.
create or replace function public.books_being_read(p_language text default null)
returns table (id uuid, title text, author_name text, language text, cover_url text,
               reading bigint, readers bigint, tier text, rank int)
language sql stable security definer set search_path = public as $$
  with counts as (
    select le.story_id,
      count(*) filter (where le.status = 'currently_reading') as reading,
      count(*) as readers
    from public.library_entries le
    group by le.story_id
  ), candidates as (
    select s.id, s.title, s.author_name, s.language, s.cover_url, s.created_at, c.reading, c.readers
    from public.stories s
    join counts c on c.story_id = s.id
    where s.kind = 'book'
      and not s.is_hidden
      and not exists (select 1 from public.library_entries le where le.story_id = s.id and le.user_id = auth.uid())
  )
  select c.id, c.title, c.author_name, c.language, c.cover_url, c.reading, c.readers,
    case when c.reading > 0 then 'reading' else 'readers' end,
    (row_number() over (
      order by (c.reading > 0) desc, (c.language is not distinct from p_language) desc,
               c.reading desc, c.readers desc, c.created_at desc, c.id
    ))::int
  from candidates c
  order by 9
  limit 30
$$;
revoke execute on function public.books_being_read(text) from public, anon;
grant execute on function public.books_being_read(text) to authenticated;
