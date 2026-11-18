-- Search Livami by title or author (PO, 16 Nov 2026; Trello "Търсене на фикшъни и книги по заглавие").
-- Only stories readers have already added: nothing is ever asked of AO3 or Open Library. Books and fics
-- together. Hidden stories (an author's opt-out or moderation) never show; fics without a link do
-- (docs/DECISIONS.md, "PO testing round on iPhone", G: in search, not in Discover).
-- From 3 characters, like every search in the app (docs/DECISIONS.md, "Search-as-you-type").
-- Order: exact title, then titles that start with the text, then other title matches, then author matches;
-- within each, the most read first. The text is cut at 200 characters (the app's field allows no more).
create or replace function public.search_stories(p_query text)
returns table (id uuid, kind public.story_kind, title text, author_name text, fandoms text[],
               status public.story_status, language text, readers bigint, rank int)
language sql stable security definer set search_path = public as $$
  with q as (select lower(left(trim(coalesce(p_query, '')), 200)) as text),
  hits as (
    select s.id, s.kind, s.title, s.author_name, s.fandoms, s.status, s.language,
      case when lower(s.title) = q.text then 0
           when starts_with(lower(s.title), q.text) then 1
           when strpos(lower(s.title), q.text) > 0 then 2
           else 3 end as closeness
    from public.stories s, q
    where not s.is_hidden
      and char_length(q.text) >= 3
      and (strpos(lower(s.title), q.text) > 0 or strpos(lower(s.author_name), q.text) > 0)
  ), readers as (select * from public.readers_per_story()),
  ranked as (
    select h.id, h.kind, h.title, h.author_name, h.fandoms, h.status, h.language,
      coalesce(r.readers, 0) as readers,
      (row_number() over (order by h.closeness, coalesce(r.readers, 0) desc, h.title, h.id))::int as rank
    from hits h left join readers r on r.story_id = h.id
  )
  select ranked.id, ranked.kind, ranked.title, ranked.author_name, ranked.fandoms, ranked.status,
         ranked.language, ranked.readers, ranked.rank
  from ranked where ranked.rank <= 20 order by ranked.rank
$$;
revoke execute on function public.search_stories(text) from public, anon;
grant execute on function public.search_stories(text) to authenticated;
