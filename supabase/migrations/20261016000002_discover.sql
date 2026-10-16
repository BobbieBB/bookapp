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

-- Comments in a story's discussions since a time (activity only: no text, any room).
create or replace function public.story_comments_since(p_story uuid, p_since timestamptz)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.comments c join public.discussions d on d.id = c.discussion_id
  where d.story_id = p_story and c.created_at >= p_since and c.deleted_at is null and not c.is_hidden
$$;
revoke execute on function public.story_comments_since(uuid, timestamptz) from public, anon, authenticated;

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
  with fandoms as (
    select f as fandom, s.id as story_id
    from public.visible_fics() s, unnest(s.fandoms) as f
    where strpos(lower(f), lower(trim(coalesce(p_query, '')))) > 0
  ), scored as (
    select fandom, count(distinct story_id) as stories,
      sum(public.story_comments_since(story_id, now() - interval '7 days')) as week,
      (select count(*) from public.library_entries le where le.story_id = any (array_agg(fandoms.story_id))) as readers
    from fandoms group by fandom
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
  select count(*) >= 2 and avg((s.status = 'completed')::int) >= 0.8 into complete_first
  from public.library_entries le join public.stories s on s.id = le.story_id
  where le.user_id = auth.uid() and s.kind = 'fanfic';

  foreach t in array tiers loop
    return query
      with candidates as (
        select s.* from public.visible_fics() s
        where (case when t = 'starter' then s.fandoms && (select array_agg(fandom) from public.starter_fandoms)
                    else s.fandoms && p_fandoms end)
          and not exists (select 1 from public.library_entries le where le.story_id = s.id and le.user_id = auth.uid())
      ), scored as (
        select c.*, case t
            when 'week' then public.story_comments_since(c.id, now() - interval '7 days')
            when 'month' then public.story_comments_since(c.id, now() - interval '30 days')
            else (select count(*) from public.library_entries le where le.story_id = c.id)
          end as activity
        from candidates c
      )
      select s.id, s.title, s.author_name, s.fandoms, s.status, s.published_sections, t, s.activity,
        (row_number() over (order by (complete_first and s.status = 'completed') desc, s.activity desc, s.created_at desc))::int
      from scored s
      where s.activity > 0 or t = 'starter'
      order by 9
      limit 20;
    if found then
      return;
    end if;
  end loop;
end $$;

revoke execute on function public.my_fandoms(), public.suggested_fandoms(), public.search_fandoms(text),
  public.lively_in_fandoms(text[]) from public, anon;
grant execute on function public.my_fandoms(), public.suggested_fandoms(), public.search_fandoms(text),
  public.lively_in_fandoms(text[]) to authenticated;

-- Activity lookups by time.
create index comments_created_idx on public.comments (created_at);
