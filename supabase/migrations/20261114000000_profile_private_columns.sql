-- Other readers see a profile's public part only (docs/DECISIONS.md, "Profile: private columns").
-- Every signed-in reader could read the whole profiles row, including when someone accepted the terms,
-- their age tick and whether they are an admin or suspended, though no screen shows these. Column grants
-- now hide them from everyone in the API; a reader reads their own through my_profile_private().
-- Row Level Security still decides which rows; the policies and the security definer helpers
-- (is_admin(), is_active_user(), ...) keep working because they don't depend on column grants.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, reads_books, reads_fanfic,
              favourite_genres, favourite_fandoms, created_at)
  on public.profiles to authenticated;

create or replace function public.my_profile_private()
returns table (is_admin boolean, is_suspended boolean, terms_version text,
               terms_accepted_at timestamptz, age_confirmed boolean)
language sql stable security definer set search_path = public as $$
  select p.is_admin, p.is_suspended, p.terms_version, p.terms_accepted_at, p.age_confirmed
  from public.profiles p
  where p.id = auth.uid();
$$;
revoke execute on function public.my_profile_private() from public, anon;
grant execute on function public.my_profile_private() to authenticated;
