-- Discover (docs/DECISIONS.md, 14 Oct 2026: "which fandoms to show", "Lively in your fandoms").

-- ---------------------------------------------------------------------------
-- A short curated list of big fandoms for an empty app and for readers who picked none.
-- AO3's canonical tag names, so they match what readers type for their fics.
-- ---------------------------------------------------------------------------
create table public.starter_fandoms (
  fandom   text primary key check (char_length(fandom) between 1 and 200),
  position int not null
);
alter table public.starter_fandoms enable row level security;
create policy starter_fandoms_read on public.starter_fandoms for select to authenticated using (true);

insert into public.starter_fandoms (fandom, position) values
  ('Harry Potter - J. K. Rowling', 1),
  ('Marvel Cinematic Universe', 2),
  ('Good Omens (TV)', 3),
  ('Sherlock (TV)', 4),
  ('Star Wars - All Media Types', 5),
  ('僕のヒーローアカデミア | Boku no Hero Academia | My Hero Academia', 6),
  ('Genshin Impact (Video Game)', 7),
  ('Percy Jackson and the Olympians & Related Fandoms - All Media Types', 8);

-- Fics anyone can see (hidden ones are an author's opt-out).
create or replace function public.visible_fics()
returns setof public.stories language sql stable security definer set search_path = public as $$
  select * from public.stories where kind = 'fanfic' and not is_hidden
$$;
revoke execute on function public.visible_fics() from public, anon, authenticated;

-- Comments per story since a time, in one pass (activity only: no text, any room).
create or replace function public.comments_per_story_since(p_since timestamptz)
returns table (story_id uuid, comments bigint) language sql stable security definer set search_path = public as $$
  select d.story_id, count(*) from public.comments c join public.discussions d on d.id = c.discussion_id
  where c.created_at >= p_since and c.deleted_at is null and not c.is_hidden
  group by d.story_id
$$;
revoke execute on function public.comments_per_story_since(timestamptz) from public, anon, authenticated;

-- Readers per story (anonymous count).
create or replace function public.readers_per_story()
returns table (story_id uuid, readers bigint) language sql stable security definer set search_path = public as $$
  select le.story_id, count(*) from public.library_entries le group by le.story_id
$$;
revoke execute on function public.readers_per_story() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- YOUR FANDOMS: picked ones first, then fandoms of fics in your library (most recent first),
-- at most 6. Nothing at all → the starter list.
-- ---------------------------------------------------------------------------
create or replace function public.my_fandoms()
returns table (fandom text, source text, place int)
language sql stable security definer set search_path = public as $$
  with picked as (
    select f as fandom, 'picked'::text as source, i as ord
    from public.profiles p, unnest(p.favourite_fandoms) with ordinality as u(f, i)
    where p.id = auth.uid()
  ), from_library as (
    select f as fandom, 'library'::text as source, 1000 + row_number() over (order by max(le.updated_at) desc) as ord
    from public.library_entries le
    join public.stories s on s.id = le.story_id and s.kind = 'fanfic' and not s.is_hidden,
    unnest(s.fandoms) as f
    where le.user_id = auth.uid()
    group by f
  ), mine as (
    select distinct on (fandom) fandom, source, ord from (select * from picked union all select * from from_library) x
    order by fandom, ord
  ), chosen as (
    select fandom, source, ord from mine
    union all
    select sf.fandom, 'starter', sf.position from public.starter_fandoms sf where not exists (select 1 from mine)
  )
  select fandom, source, (row_number() over (order by ord))::int from chosen order by ord limit 6
$$;

-- Fandoms of fics in your library you haven't added to your favourites (Profile's dashed "+" chips).
create or replace function public.suggested_fandoms()
returns table (fandom text)
language sql stable security definer set search_path = public as $$
  select distinct f
  from public.library_entries le
  join public.stories s on s.id = le.story_id and s.kind = 'fanfic' and not s.is_hidden,
  unnest(s.fandoms) as f
  where le.user_id = auth.uid()
    and not f = any ((select favourite_fandoms from public.profiles where id = auth.uid())::text[])
  order by f
$$;

-- ---------------------------------------------------------------------------
-- All fandoms: fandoms of visible fics, matching the search text, most discussed this week first,
-- then most read.
-- ---------------------------------------------------------------------------
create or replace function public.search_fandoms(p_query text)
returns table (fandom text, stories bigint, rank int)
language sql stable security definer set search_path = public as $$
  with q as (select lower(trim(coalesce(p_query, ''))) as text),
  fandoms as (
    select f as fandom, s.id as story_id
    from public.visible_fics() s, unnest(s.fandoms) as f, q
    -- Empty text lists every fandom; otherwise search from 3 characters, like book search.
    where q.text = '' or (char_length(q.text) >= 3 and strpos(lower(f), q.text) > 0)
    group by f, s.id
  ), week as (select * from public.comments_per_story_since(now() - interval '7 days')),
  readers as (select * from public.readers_per_story()),
  scored as (
    select f.fandom, count(*) as stories, coalesce(sum(w.comments), 0) as week, coalesce(sum(r.readers), 0) as readers
    from fandoms f
    left join week w on w.story_id = f.story_id
    left join readers r on r.story_id = f.story_id
    group by f.fandom
  )
  select fandom, stories, (row_number() over (order by week desc, readers desc, fandom))::int
  from scored order by 3 limit 30
$$;

-- ---------------------------------------------------------------------------
-- Lively in your fandoms: fics you don't read yet in these fandoms, ranked by discussion this
-- week; never empty: a quiet week widens to 30 days, then to the most read, then to the starter
-- fandoms. Readers whose library (2+ fics) is at least 80% complete fics see complete ones first.
-- ---------------------------------------------------------------------------
create or replace function public.lively_in_fandoms(p_fandoms text[])
returns table (id uuid, title text, author_name text, fandoms text[], status public.story_status,
               published_sections int, tier text, activity bigint, rank int)
language plpgsql stable security definer set search_path = public as $$
declare
  complete_first boolean;
  tiers text[] := array['week', 'month', 'readers', 'starter'];
  t text;
begin
  select count(*) >= 2 and avg(coalesce((s.status = 'completed')::int, 0)) >= 0.8 into complete_first
  from public.library_entries le join public.stories s on s.id = le.story_id
  where le.user_id = auth.uid() and s.kind = 'fanfic';

  foreach t in array tiers loop
    return query
      with candidates as (
        select s.* from public.visible_fics() s
        where (case when t = 'starter' then s.fandoms && (select array_agg(fandom) from public.starter_fandoms)
                    else s.fandoms && p_fandoms end)
          and not exists (select 1 from public.library_entries le where le.story_id = s.id and le.user_id = auth.uid())
      ), activity as (
        select * from public.comments_per_story_since(now() - interval '7 days') where t = 'week'
        union all
        select * from public.comments_per_story_since(now() - interval '30 days') where t = 'month'
        union all
        select * from public.readers_per_story() where t in ('readers', 'starter')
      ), scored as (
        select c.*, coalesce(a.comments, 0) as activity
        from candidates c left join activity a on a.story_id = c.id
      )
      select s.id, s.title, s.author_name, s.fandoms, s.status, s.published_sections, t, s.activity,
        (row_number() over (order by (complete_first and s.status = 'completed') desc, s.activity desc, s.created_at desc, s.id))::int
      from scored s
      where s.activity > 0 or t = 'starter'
      order by 9
      limit 20;
    if found then
      return;
    end if;
  end loop;
end $$;

-- Profile > Your fandoms: add or remove one in place, so two quick taps (or two devices) never
-- overwrite each other.
create or replace function public.add_favourite_fandom(p_fandom text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if char_length(trim(coalesce(p_fandom, ''))) not between 1 and 200 then
    raise exception 'a fandom needs a name';
  end if;
  update public.profiles set favourite_fandoms = array_append(favourite_fandoms, trim(p_fandom))
  where id = auth.uid() and not trim(p_fandom) = any (favourite_fandoms);
end $$;

create or replace function public.remove_favourite_fandom(p_fandom text)
returns void language sql security invoker set search_path = public as $$
  update public.profiles set favourite_fandoms = array_remove(favourite_fandoms, p_fandom) where id = auth.uid()
$$;

revoke execute on function public.add_favourite_fandom(text), public.remove_favourite_fandom(text) from public, anon;
grant execute on function public.add_favourite_fandom(text), public.remove_favourite_fandom(text) to authenticated;

revoke execute on function public.my_fandoms(), public.suggested_fandoms(), public.search_fandoms(text),
  public.lively_in_fandoms(text[]) from public, anon;
grant execute on function public.my_fandoms(), public.suggested_fandoms(), public.search_fandoms(text),
  public.lively_in_fandoms(text[]) to authenticated;

-- Activity per story: discussions by story (the existing indexes are partial per room kind).
create index discussions_story_idx on public.discussions (story_id);
