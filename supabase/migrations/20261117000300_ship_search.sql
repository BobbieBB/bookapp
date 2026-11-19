-- Discover: search by ship, with nicknames (PO, phone test 20 Oct 2026; Trello "Discover: търсене по ship").
-- Readers search the way they talk: "dramione", not "Draco Malfoy/Hermione Granger". The fandom search finds
-- ships too, by the characters' names and by a ship's nickname. Only ships of fics in Livami are found.

-- ---------------------------------------------------------------------------
-- Nicknames of popular ships. A nickname lists the characters' names as AO3 spells them; a ship matches when
-- its tag contains every one (in any order, so "Hermione Granger/Draco Malfoy" and "Draco Malfoy/Hermione
-- Granger" both do). A nickname may have more than one row (Reylo: Rey with Kylo Ren, or with Ben Solo).
-- A table, not code, so the list grows without a new app version.
-- ---------------------------------------------------------------------------
create table public.ship_nicknames (
  nickname   text not null check (nickname = lower(nickname) and char_length(nickname) between 3 and 40),
  characters text[] not null check (cardinality(characters) between 2 and 4),
  primary key (nickname, characters)
);
alter table public.ship_nicknames enable row level security;
create policy ship_nicknames_read on public.ship_nicknames for select to authenticated using (true);

insert into public.ship_nicknames (nickname, characters) values
  -- Harry Potter
  ('dramione', '{Draco Malfoy,Hermione Granger}'),
  ('drarry', '{Draco Malfoy,Harry Potter}'),
  ('wolfstar', '{Sirius Black,Remus Lupin}'),
  ('jily', '{James Potter,Lily Evans}'),
  ('jegulus', '{James Potter,Regulus Black}'),
  ('romione', '{Ron Weasley,Hermione Granger}'),
  ('hinny', '{Harry Potter,Ginny Weasley}'),
  ('harmony', '{Harry Potter,Hermione Granger}'),
  ('tomarry', '{Riddle,Harry Potter}'),
  -- Marvel
  ('stucky', '{Steve Rogers,Bucky}'),
  ('stony', '{Steve Rogers,Tony Stark}'),
  ('ironstrange', '{Tony Stark,Stephen Strange}'),
  ('sambucky', '{Sam Wilson,Bucky}'),
  ('thorki', '{Thor,Loki}'),
  -- Star Wars
  ('reylo', '{Rey,Kylo Ren}'),
  ('reylo', '{Rey,Ben Solo}'),
  ('kylux', '{Armitage Hux,Kylo Ren}'),
  ('obikin', '{Obi-Wan Kenobi,Anakin Skywalker}'),
  -- TV and books
  ('johnlock', '{John Watson,Sherlock Holmes}'),
  ('destiel', '{Castiel,Dean Winchester}'),
  ('sabriel', '{Gabriel,Sam Winchester}'),
  ('ineffable husbands', '{Aziraphale,Crowley}'),
  ('aziracrow', '{Aziraphale,Crowley}'),
  ('malec', '{Alec Lightwood,Magnus Bane}'),
  ('sterek', '{Derek Hale,Stiles Stilinski}'),
  ('hannigram', '{Hannibal Lecter,Will Graham}'),
  ('merthur', '{Merlin,Arthur Pendragon}'),
  ('spirk', '{Kirk,Spock}'),
  ('klaroline', '{Klaus Mikaelson,Caroline Forbes}'),
  ('delena', '{Damon Salvatore,Elena Gilbert}'),
  ('bellarke', '{Bellamy Blake,Clarke Griffin}'),
  ('clexa', '{Clarke Griffin,Lexa}'),
  ('jonsa', '{Jon Snow,Sansa Stark}'),
  ('gendrya', '{Gendry,Arya Stark}'),
  ('bughead', '{Betty Cooper,Jughead Jones}'),
  ('buddie', '{Eddie Diaz,Buckley}'),
  ('steddie', '{Steve Harrington,Eddie Munson}'),
  ('byler', '{Will Byers,Mike Wheeler}'),
  ('wenclair', '{Wednesday Addams,Enid Sinclair}'),
  ('everlark', '{Katniss Everdeen,Peeta Mellark}'),
  ('percabeth', '{Percy Jackson,Annabeth Chase}'),
  ('solangelo', '{Nico di Angelo,Will Solace}'),
  ('feysand', '{Feyre,Rhysand}'),
  ('nessian', '{Nesta,Cassian}'),
  ('xaolet', '{Xaden,Violet Sorrengail}'),
  -- Animation
  ('klance', '{Keith,Lance}'),
  ('zukka', '{Zuko,Sokka}'),
  ('zutara', '{Zuko,Katara}'),
  ('korrasami', '{Korra,Asami Sato}'),
  ('catradora', '{Catra,Adora}'),
  -- Anime, manga, donghua, games
  ('bakudeku', '{Bakugou Katsuki,Midoriya Izuku}'),
  ('tododeku', '{Todoroki Shouto,Midoriya Izuku}'),
  ('kiribaku', '{Kirishima Eijirou,Bakugou Katsuki}'),
  ('kagehina', '{Kageyama Tobio,Hinata Shouyou}'),
  ('iwaoi', '{Iwaizumi Hajime,Oikawa Tooru}'),
  ('kuroken', '{Kuroo Tetsurou,Kozume Kenma}'),
  ('sasunaru', '{Uchiha Sasuke,Uzumaki Naruto}'),
  ('eruri', '{Erwin Smith,Levi}'),
  ('ereri', '{Eren Yeager,Levi}'),
  ('satosugu', '{Gojou Satoru,Getou Suguru}'),
  ('wangxian', '{Lan Wangji,Wei Wuxian}'),
  ('hualian', '{Hua Cheng,Xie Lian}'),
  ('zhongchi', '{Zhongli,Tartaglia}');

-- ---------------------------------------------------------------------------
-- Ships of fics anyone can find (visible_fics: not hidden, with their AO3 link), matching the search text by
-- name or nickname, most fics first. From 3 characters, like every search.
-- ---------------------------------------------------------------------------
create or replace function public.search_ships(p_query text)
returns table (ship text, nickname text, stories bigint, rank int)
language sql stable security definer set search_path = public as $$
  with q as (select lower(trim(coalesce(p_query, ''))) as text),
  ships as (
    select distinct sh as ship, s.id as story_id
    from public.visible_fics() s, unnest(s.ships) as sh
  ), named as (
    -- The nickname that matched, if any (the alphabetically first when several do), to show next to the tag. Only
    -- for a romantic tag ("A/B"): a nickname is never matched to a friendship tag ("A & B").
    select sp.ship, sp.story_id,
      (select min(n.nickname) from public.ship_nicknames n, q
        where strpos(sp.ship, '/') > 0
          and starts_with(n.nickname, q.text)
          and (select bool_and(strpos(lower(sp.ship), lower(ch)) > 0) from unnest(n.characters) ch)) as nickname
    from ships sp
  ), hits as (
    select named.* from named, q
    where char_length(q.text) >= 3 and (strpos(lower(named.ship), q.text) > 0 or named.nickname is not null)
  ), scored as (
    -- The count is what tapping the ship lists: fics you don't have in your library yet.
    select ship, min(nickname) as nickname,
      count(distinct story_id) filter (
        where not exists (select 1 from public.library_entries le where le.story_id = hits.story_id and le.user_id = auth.uid())
      ) as stories
    from hits group by ship
  )
  select ship, nickname, stories, (row_number() over (order by stories desc, ship))::int
  from scored order by 4 limit 30
$$;
revoke execute on function public.search_ships(text) from public, anon;
grant execute on function public.search_ships(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fics with one ship that you don't read yet, most read first (the shape of lively_in_fandoms, tier
-- 'readers'), optionally complete only.
-- ---------------------------------------------------------------------------
create or replace function public.fics_with_ship(p_ship text, p_complete_only boolean default false)
returns table (id uuid, title text, author_name text, fandoms text[], status public.story_status,
               published_sections int, tier text, activity bigint, rank int)
language sql stable security definer set search_path = public as $$
  with r as (select * from public.readers_per_story()),
  candidates as (
    select s.id, s.title, s.author_name, s.fandoms, s.status, s.published_sections, coalesce(r.readers, 0) as activity
    from public.visible_fics() s left join r on r.story_id = s.id
    where p_ship = any (s.ships)
      and (not coalesce(p_complete_only, false) or s.status = 'completed')
      and not exists (select 1 from public.library_entries le where le.story_id = s.id and le.user_id = auth.uid())
  )
  select c.id, c.title, c.author_name, c.fandoms, c.status, c.published_sections, 'readers'::text, c.activity,
         (row_number() over (order by c.activity desc, c.title, c.id))::int
  from candidates c order by 9 limit 30
$$;
revoke execute on function public.fics_with_ship(text, boolean) from public, anon;
grant execute on function public.fics_with_ship(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Adding a fic: a nickname typed in the Ship field ("Dramione") is offered as the full tag readers already use in
-- Livami for those characters (the most used, over every row of the nickname: Reylo is Rey with Kylo Ren or Ben Solo).
-- Only a tag in use, never one made up from the list: AO3's tags don't always spell the characters as the list does
-- ("James "Bucky" Barnes"), and a made-up spelling would split one ship into two. Null when nothing matches.
-- ---------------------------------------------------------------------------
create or replace function public.ship_for_nickname(p_nickname text)
returns text
language sql stable security definer set search_path = public as $$
  with n as (
    select characters from public.ship_nicknames where nickname = lower(trim(coalesce(p_nickname, '')))
  ), used as (
    select sh as ship, count(*) as uses
    from public.visible_fics() s, unnest(s.ships) as sh
    where strpos(sh, '/') > 0
      and exists (select 1 from n where (select bool_and(strpos(lower(sh), lower(ch)) > 0) from unnest(n.characters) ch))
    group by sh
  )
  select ship from used order by uses desc, ship limit 1
$$;
revoke execute on function public.ship_for_nickname(text) from public, anon;
grant execute on function public.ship_for_nickname(text) to authenticated;
