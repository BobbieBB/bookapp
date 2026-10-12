-- Book app (working name; product name TBD) — initial schema
--
-- Core loop: add story → mark last finished chapter → discuss without spoilers → next chapter.
--
-- Key rule (Spoiler Safe Mode), enforced in the database, not only in the UI:
--   A user can read/write a chapter discussion N only if, in their library entry for that story,
--   status = 'finished' OR progress_section >= N.
--   The Hangover room (whole-story discussion) is readable only when status = 'finished'.
--
-- Fandom etiquette (see docs/DECISIONS.md):
--   * everything is behind login (no anon access to any table)
--   * star ratings for fanfiction are private to the rater; publicly only "recs"
--   * stories can be hidden (author opt-out); hidden stories hide their discussions too
--   * the app never stores fic text — only metadata and a link to the original

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.story_kind as enum ('book', 'fanfic');
create type public.story_status as enum ('completed', 'ongoing');
create type public.story_source as enum ('open_library', 'ao3', 'manual');
create type public.library_status as enum ('currently_reading', 'want_to_read', 'finished', 'dnf', 'on_hold');
create type public.visibility as enum ('public', 'friends', 'private');
create type public.discussion_kind as enum ('chapter', 'hangover');
create type public.report_reason as enum ('spam', 'harassment', 'spoiler', 'inappropriate', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.notification_type as enum ('reply', 'reaction');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name  text check (char_length(display_name) <= 60),
  avatar_url    text,
  reads_books   boolean not null default true,
  reads_fanfic  boolean not null default false,
  favourite_genres  text[] not null default '{}',
  favourite_fandoms text[] not null default '{}',
  is_admin      boolean not null default false,
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not is_suspended)
$$;

-- ---------------------------------------------------------------------------
-- Stories (books and fanfiction share one catalogue, shown in separate sections)
-- ---------------------------------------------------------------------------

-- Books without chapters are split into fixed 25-page discussion ranges.
create or replace function public.page_range_size() returns int language sql immutable as $$ select 25 $$;

create table public.stories (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.story_kind not null,
  title              text not null check (char_length(title) between 1 and 300),
  author_name        text not null check (char_length(author_name) between 1 and 200),
  cover_url          text,
  description        text check (char_length(description) <= 5000),
  language           text,
  -- books
  genres             text[] not null default '{}',
  series_name        text,
  series_number      numeric,
  publication_year   int,
  page_count         int check (page_count > 0),
  -- fanfiction
  fandoms            text[] not null default '{}',
  ships              text[] not null default '{}',
  tags               text[] not null default '{}',
  content_rating     text,
  warnings           text[] not null default '{}',
  word_count         int check (word_count >= 0),
  -- sections (chapters, or 25-page ranges for books without chapters)
  has_chapters       boolean not null default true,
  published_sections int check (published_sections >= 0),
  total_sections     int check (total_sections > 0),  -- null = unknown / ongoing
  status             public.story_status,
  -- provenance (we only keep metadata and a link, never the text)
  source             public.story_source not null default 'manual',
  source_id          text,       -- e.g. Open Library work id
  source_url         text,       -- e.g. AO3 work link
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  is_hidden          boolean not null default false,  -- author opt-out or moderation
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint fanfic_needs_link check (kind <> 'fanfic' or source_url is not null),
  constraint fanfic_has_chapters check (kind <> 'fanfic' or has_chapters),
  constraint pages_needed_without_chapters check (has_chapters or page_count is not null),
  constraint sections_consistent check (
    total_sections is null or published_sections is null or published_sections <= total_sections
  )
);

create unique index stories_source_id_uniq on public.stories (source, source_id) where source_id is not null;
create unique index stories_source_url_uniq on public.stories (lower(source_url)) where source_url is not null;
create index stories_kind_idx on public.stories (kind) where not is_hidden;
create index stories_genres_idx on public.stories using gin (genres);
create index stories_fandoms_idx on public.stories using gin (fandoms);
create index stories_ships_idx on public.stories using gin (ships);

-- Number of discussable sections for a story (null when unknown).
create or replace function public.section_count(s public.stories)
returns int language sql immutable as $$
  select case
    when s.has_chapters then coalesce(s.published_sections, s.total_sections)
    else ceil(s.page_count::numeric / public.page_range_size())::int
  end
$$;

-- Which 25-page range is fully finished once a reader finished page `p`.
create or replace function public.section_for_page(p int, page_count int)
returns int language sql immutable as $$
  select case
    when p is null or p <= 0 then 0
    when page_count is not null and p >= page_count then ceil(page_count::numeric / public.page_range_size())::int
    else p / public.page_range_size()
  end
$$;

-- ---------------------------------------------------------------------------
-- Library (one entry per user per story)
-- ---------------------------------------------------------------------------

create table public.library_entries (
  user_id          uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  story_id         uuid not null references public.stories (id) on delete cascade,
  status           public.library_status not null default 'want_to_read',
  is_favourite     boolean not null default false,
  -- last FULLY finished chapter (or 25-page range); 0 = nothing finished yet
  progress_section int not null default 0 check (progress_section >= 0),
  -- for books without chapters: last finished page; progress_section is derived from it
  progress_page    int check (progress_page >= 0),
  visibility       public.visibility not null default 'public',
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, story_id)
);

create index library_story_idx on public.library_entries (story_id);

create or replace function public.library_entry_normalise()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.stories;
  max_section int;
begin
  select * into s from public.stories where id = new.story_id;

  if s.kind = 'book' and new.status = 'on_hold' then
    raise exception 'on_hold is only available for fanfiction';
  end if;

  if not s.has_chapters then
    new.progress_section := public.section_for_page(new.progress_page, s.page_count);
  end if;

  max_section := public.section_count(s);
  if max_section is not null and new.progress_section > max_section then
    raise exception 'progress (%) is beyond the published sections (%)', new.progress_section, max_section;
  end if;

  if new.status = 'currently_reading' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status = 'finished' and (tg_op = 'INSERT' or old.status is distinct from 'finished') then
    new.finished_at := now();
    if max_section is not null then
      new.progress_section := max_section;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger library_entry_normalise
  before insert or update on public.library_entries
  for each row execute function public.library_entry_normalise();

-- ---------------------------------------------------------------------------
-- Spoiler Safe Mode: who may access which discussion
-- ---------------------------------------------------------------------------

create table public.discussions (
  id             uuid primary key default gen_random_uuid(),
  story_id       uuid not null references public.stories (id) on delete cascade,
  kind           public.discussion_kind not null,
  section_number int,
  created_at     timestamptz not null default now(),
  constraint section_matches_kind check (
    (kind = 'chapter' and section_number >= 1) or (kind = 'hangover' and section_number is null)
  )
);

create unique index discussions_chapter_uniq on public.discussions (story_id, section_number) where kind = 'chapter';
create unique index discussions_hangover_uniq on public.discussions (story_id) where kind = 'hangover';

-- The single source of truth for spoiler protection.
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
          -- Hangover: only once the whole story is Finished
          (p_kind = 'hangover' and le.status = 'finished')
          -- Chapter N: the reader fully finished chapter N. "Finished" opens every chapter only
          -- for completed stories; on a WIP fic, a new chapter stays locked until it is read.
          or (p_kind = 'chapter' and (
                le.progress_section >= p_section
                or (le.status = 'finished' and s.status is distinct from 'ongoing')
             ))
        )
    )
$$;

create or replace function public.can_access_discussion(p_discussion uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select public.can_access_section(d.story_id, d.kind, d.section_number)
    from public.discussions d where d.id = p_discussion
  ), false)
$$;

-- Returns (creating if needed) the discussion for a section the caller has unlocked.
create or replace function public.open_discussion(p_story uuid, p_kind public.discussion_kind, p_section int default null)
returns public.discussions
language plpgsql security definer set search_path = public
as $$
declare
  d public.discussions;
begin
  if not public.can_access_section(p_story, p_kind, p_section) then
    raise exception 'locked: finish this chapter to join the discussion' using errcode = '42501';
  end if;

  if p_kind = 'hangover' then
    select * into d from public.discussions where story_id = p_story and kind = 'hangover';
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

-- Anonymous counts only: "X readers have finished this chapter".
create or replace function public.section_reader_counts(p_story uuid)
returns table (section_number int, readers bigint)
language sql stable security definer set search_path = public
as $$
  with entries as (
    select le.progress_section, le.status
    from public.library_entries le
    join public.stories s on s.id = le.story_id
    where le.story_id = p_story and not s.is_hidden
      and le.status in ('currently_reading', 'finished', 'dnf', 'on_hold')
  ), sections as (
    select generate_series(1, greatest(coalesce((select max(progress_section) from entries), 0), 1)) as n
  )
  select n, (select count(*) from entries e where e.status = 'finished' or e.progress_section >= n)
  from sections
$$;

-- ---------------------------------------------------------------------------
-- Comments, reactions, follows
-- ---------------------------------------------------------------------------

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  discussion_id  uuid not null references public.discussions (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  parent_id      uuid references public.comments (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 4000),
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,
  is_hidden      boolean not null default false  -- hidden by moderation
);

create index comments_discussion_idx on public.comments (discussion_id, created_at);
create index comments_parent_idx on public.comments (parent_id);

create table public.reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji      text not null check (emoji in ('❤️', '😭', '😱', '😂', '🔥', '👀')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create table public.discussion_follows (
  user_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  muted         boolean not null default false,
  primary key (user_id, discussion_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

-- Used by policies on comments without re-entering the comments policies.
create or replace function public.comment_author_of(p_comment uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select author_id from public.comments where id = p_comment
$$;

-- Comments can only be edited in their body; everything else is fixed.
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
  if new.body <> old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger comments_guard_update before update on public.comments
  for each row execute function public.comments_guard_update();

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
  end if;
  return new;
end $$;

create trigger comments_check_parent before insert on public.comments
  for each row execute function public.comments_check_parent();

-- ---------------------------------------------------------------------------
-- Notifications (never contain comment text, so they can never leak spoilers)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  type          public.notification_type not null,
  actor_id      uuid references public.profiles (id) on delete set null,
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  comment_id    uuid references public.comments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function public.comments_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_author uuid;
begin
  -- writing in a discussion follows it
  insert into public.discussion_follows (user_id, discussion_id)
  values (new.author_id, new.discussion_id)
  on conflict (user_id, discussion_id) do update set last_read_at = now();

  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is not null
       and parent_author <> new.author_id
       and not public.is_blocked_between(parent_author, new.author_id)
       and not exists (
         select 1 from public.discussion_follows f
         where f.user_id = parent_author and f.discussion_id = new.discussion_id and f.muted
       ) then
      insert into public.notifications (user_id, type, actor_id, discussion_id, comment_id)
      values (parent_author, 'reply', new.author_id, new.discussion_id, new.id);
    end if;
  end if;
  return new;
end $$;

create trigger comments_after_insert after insert on public.comments
  for each row execute function public.comments_after_insert();

create or replace function public.reactions_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = new.comment_id;
  if c.author_id <> new.user_id and not public.is_blocked_between(c.author_id, new.user_id) then
    insert into public.notifications (user_id, type, actor_id, discussion_id, comment_id)
    values (c.author_id, 'reaction', new.user_id, c.discussion_id, c.id);
  end if;
  return new;
end $$;

create trigger reactions_after_insert after insert on public.reactions
  for each row execute function public.reactions_after_insert();

-- ---------------------------------------------------------------------------
-- Ratings, reviews and recs
-- ---------------------------------------------------------------------------

-- Star ratings. Public for books; for fanfiction only the rater can ever see them.
create table public.ratings (
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  rating     numeric(2,1) not null check (rating between 0.5 and 5 and (rating * 2) = floor(rating * 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

-- Written reviews (books) and recs (fanfiction). Not progress-locked; spoilers are flagged and blurred.
create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  story_id          uuid not null references public.stories (id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 10000),
  contains_spoilers boolean not null default false,
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, story_id)
);

create or replace function public.story_kind_of(p_story uuid)
returns public.story_kind language sql stable security definer set search_path = public as $$
  select kind from public.stories where id = p_story
$$;

-- Average rating — books only. Fanfiction never gets a public score.
create view public.book_rating_stats with (security_invoker = true) as
  select r.story_id, round(avg(r.rating), 2) as average_rating, count(*) as ratings_count
  from public.ratings r
  join public.stories s on s.id = r.story_id
  where s.kind = 'book' and not s.is_hidden
  group by r.story_id;

-- ---------------------------------------------------------------------------
-- Moderation, author opt-out, feedback
-- ---------------------------------------------------------------------------

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  comment_id       uuid references public.comments (id) on delete cascade,
  review_id        uuid references public.reviews (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete cascade,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 2000),
  status           public.report_status not null default 'open',
  created_at       timestamptz not null default now(),
  check (num_nonnulls(comment_id, review_id, reported_user_id) = 1)
);

-- Authors asking for their fic to be hidden. Processed by an admin, who sets stories.is_hidden.
create table public.removal_requests (
  id           uuid primary key default gen_random_uuid(),
  story_id     uuid references public.stories (id) on delete set null,
  story_url    text,
  requester_id uuid references public.profiles (id) on delete set null default auth.uid(),
  contact      text,
  message      text check (char_length(message) <= 4000),
  status       public.report_status not null default 'open',
  created_at   timestamptz not null default now(),
  check (story_id is not null or story_url is not null)
);

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null default auth.uid(),
  kind        text not null check (kind in ('problem', 'idea', 'other')),
  body        text not null check (char_length(body) between 1 and 4000),
  app_version text,
  device      text,
  created_at  timestamptz not null default now()
);

-- WIP fics get new chapters: any reader may raise the published chapter count (never lower it).
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
  update public.stories
     set published_sections = greatest(coalesce(published_sections, 0), p_count),
         updated_at = now()
   where id = p_story and has_chapters and not is_hidden
     and (total_sections is null or p_count <= total_sections)
  returning * into s;
  if s.id is null then
    raise exception 'cannot update chapters for this story';
  end if;
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security — nothing is readable without login (fandom etiquette)
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.stories            enable row level security;
alter table public.library_entries    enable row level security;
alter table public.discussions        enable row level security;
alter table public.comments           enable row level security;
alter table public.reactions          enable row level security;
alter table public.discussion_follows enable row level security;
alter table public.blocks             enable row level security;
alter table public.notifications      enable row level security;
alter table public.ratings            enable row level security;
alter table public.reviews            enable row level security;
alter table public.reports            enable row level security;
alter table public.removal_requests   enable row level security;
alter table public.feedback           enable row level security;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- profiles
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and not is_admin and not is_suspended);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Column-level: a table-wide UPDATE grant would let users set is_admin / is_suspended.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, reads_books, reads_fanfic, favourite_genres, favourite_fandoms)
  on public.profiles to authenticated;

-- stories
create policy stories_read on public.stories for select to authenticated
  using (not is_hidden or created_by = auth.uid() or public.is_admin());
create policy stories_insert on public.stories for insert to authenticated
  with check (created_by = auth.uid() and not is_hidden and public.is_active_user());
create policy stories_update_creator on public.stories for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (public.is_admin() or (created_by = auth.uid() and not is_hidden));
create policy stories_delete_admin on public.stories for delete to authenticated
  using (public.is_admin());

-- library: own entries always; others only when public
create policy library_read on public.library_entries for select to authenticated
  using (user_id = auth.uid() or visibility = 'public');
create policy library_write_own on public.library_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- discussions: existence is not a spoiler; creation only through open_discussion()
create policy discussions_read on public.discussions for select to authenticated using (true);

-- comments: the spoiler wall
create policy comments_read on public.comments for select to authenticated
  using (
    public.can_access_discussion(discussion_id)
    and (author_id = auth.uid() or public.is_admin() or (
      not is_hidden
      and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = comments.author_id)
    ))
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and public.can_access_discussion(discussion_id)
    and (parent_id is null or not public.is_blocked_between(public.comment_author_of(parent_id), auth.uid()))
  );
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
create policy comments_delete_own on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- reactions
create policy reactions_read on public.reactions for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_active_user()
    and exists (select 1 from public.comments c where c.id = comment_id
                and not public.is_blocked_between(c.author_id, auth.uid()))
  );
create policy reactions_delete_own on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- follows, blocks, notifications: private to the user
create policy follows_own on public.discussion_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ratings: books public, fanfic private to the rater
create policy ratings_read on public.ratings for select to authenticated
  using (user_id = auth.uid() or public.story_kind_of(story_id) = 'book');
create policy ratings_write_own on public.ratings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());

-- reviews / recs
create policy reviews_read on public.reviews for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or (
    not is_hidden
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = reviews.user_id)
  ));
create policy reviews_write_own on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and not is_hidden and public.is_active_user());
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (user_id = auth.uid() and not is_hidden));
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- moderation tables: write your own, read your own; admins read all
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated using (public.is_admin());

create policy removal_insert on public.removal_requests for insert to authenticated with check (requester_id = auth.uid());
create policy removal_read on public.removal_requests for select to authenticated using (requester_id = auth.uid() or public.is_admin());
create policy removal_admin_update on public.removal_requests for update to authenticated using (public.is_admin());

create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid());
create policy feedback_read on public.feedback for select to authenticated using (user_id = auth.uid() or public.is_admin());
