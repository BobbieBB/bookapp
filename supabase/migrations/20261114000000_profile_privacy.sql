-- Other readers see only the public part of a profile (docs/legal/privacy-policy.md, "Profile"): Name,
-- whether you read books and/or fanfiction, favourite genres and fandoms, join date. The admin and
-- suspension flags and the terms acceptance stay with the owner. Postgres has no per-row column rights,
-- so the table grants only the public columns to everyone and the owner reads her whole row through
-- my_profile(). Security definer functions (is_admin(), is_active_user(), moderation, Discover) run as
-- the table owner and keep reading every column; RLS policy expressions are not column-checked.
revoke select on public.profiles from authenticated, anon;
grant select (id, username, display_name, avatar_url, reads_books, reads_fanfic, favourite_genres, favourite_fandoms, created_at)
  on public.profiles to authenticated;

-- The signed-in reader's own profile, every column; no row before onboarding.
create or replace function public.my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public
as $$
  select * from public.profiles where id = auth.uid()
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- A reader's library is readable only by its owner (docs/DECISIONS.md, "Library: private by default").
-- 20261113000000 made new entries private, but the read policy still showed public ones and the owner
-- could set visibility = 'public' through the API. Now entries can only be private, and the policy no
-- longer looks at visibility at all. Counts across readers go through security definer functions.
update public.library_entries set visibility = 'private' where visibility <> 'private';
alter table public.library_entries add constraint library_entries_private check (visibility = 'private');

drop policy library_read on public.library_entries;
create policy library_read on public.library_entries for select to authenticated
  using (user_id = auth.uid());
