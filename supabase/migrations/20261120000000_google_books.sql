-- Google Books as a second source for book search (PO, 19 Nov 2026). The app asks our Edge Function
-- (supabase/functions/google-books), which holds the API key; a Google result is stored like an Open
-- Library one: source 'google_books', source_id '<volume id>#<language>'. Covers may come from Google's
-- cover server too. The new enum value is compared as text below, so this file is safe in one transaction.
alter type public.story_source add value if not exists 'google_books';

alter table public.stories
  add constraint google_books_edition_id check (
    source::text <> 'google_books' or source_id is null or source_id like '%#' || language
  ),
  drop constraint cover_from_open_library,
  -- Covers come from Open Library or Google Books only; custom covers are private (Storage), never here.
  add constraint cover_from_book_sources check (
    cover_url is null
    or cover_url ~ '^https://covers\.openlibrary\.org/'
    or cover_url ~ '^https://books\.google\.com/books/(publisher/)?content\?'
  );

-- The weekly numbers count a book found by search, from either source, as "search".
create or replace function public.admin_numbers(p_weeks int default 8)
returns table (
  week date, active int, signed_up int, returned_week1 int, discussion_readers int,
  added_search int, added_manual int, added_ao3 int, added_bg int, added_en int, added_unknown int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  this_week constant timestamp := date_trunc('week', now() at time zone 'UTC');
begin
  if not public.is_admin() then
    raise exception 'only admins can see the numbers' using errcode = '42501';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 104 then
    raise exception 'p_weeks must be between 1 and 104' using errcode = '22023';
  end if;

  return query
  with weeks as (
    select generate_series(this_week - (p_weeks - 1) * interval '1 week', this_week, interval '1 week') as starts
  ),
  events as (
    select e.user_id, e.name, e.props, e.created_at, date_trunc('week', e.created_at at time zone 'UTC') as starts
    from public.analytics_events e
    where e.created_at >= (this_week - (p_weeks - 1) * interval '1 week') at time zone 'UTC'
  ),
  sign_ups as (
    select e.user_id, min(e.created_at) as at
    from public.analytics_events e
    where e.name = 'sign_up' and e.created_at >= (this_week - (p_weeks - 1) * interval '1 week') at time zone 'UTC'
    group by e.user_id
  ),
  cohorts as (
    select date_trunc('week', s.at at time zone 'UTC') as starts,
           count(*)::int as signed_up,
           count(*) filter (where exists (
             select 1 from public.analytics_events r
             where r.user_id = s.user_id and r.created_at >= s.at + interval '7 days' and r.created_at < s.at + interval '14 days'
           ))::int as returned
    from sign_ups s
    group by 1
  )
  select w.starts::date,
         (select count(distinct e.user_id) from events e where e.starts = w.starts)::int,
         coalesce(c.signed_up, 0),
         case when w.starts + interval '21 days' <= now() at time zone 'UTC' then coalesce(c.returned, 0) end,
         (select count(distinct e.user_id) from events e
           where e.starts = w.starts and e.name in ('room_opened', 'comment_posted', 'reaction_added'))::int,
         a.search, a.manual, a.ao3, a.bg, a.en, a.unknown
  from weeks w
  left join cohorts c on c.starts = w.starts
  cross join lateral (
    select count(*) filter (where e.props ->> 'source' in ('open_library', 'google_books'))::int as search,
           count(*) filter (where e.props ->> 'source' = 'manual')::int as manual,
           count(*) filter (where e.props ->> 'source' = 'ao3')::int as ao3,
           count(*) filter (where e.props ->> 'language' = 'bg')::int as bg,
           count(*) filter (where e.props ->> 'language' = 'en')::int as en,
           count(*) filter (where (e.props ->> 'language') is distinct from 'bg' and (e.props ->> 'language') is distinct from 'en')::int as unknown
    from events e
    where e.starts = w.starts and e.name = 'story_added'
  ) a
  order by w.starts;
end $$;
revoke execute on function public.admin_numbers(int) from public, anon;
grant execute on function public.admin_numbers(int) to authenticated;
