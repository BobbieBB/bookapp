-- A fic without a link (docs/DECISIONS.md, "PO testing round on iPhone", G). When AO3 is down, or the
-- fic lives elsewhere, a reader adds it by hand: title, author, fandom, chapters, rating, with no link.
-- Such a fic is source 'manual' and stays out of Discover (we can't send readers to the author, or match
-- an author's removal request by link) until a reader who has it adds the AO3 link with set_fic_link().
alter table public.stories drop constraint fanfic_needs_link;
alter table public.stories add constraint fanfic_link_or_manual
  check (kind <> 'fanfic' or source_url is not null or source = 'manual');

-- Fics anyone can find in Discover and the fandom search (20261016000002_discover.sql): now only fics with
-- their AO3 link. Hidden ones are still an author's opt-out.
create or replace function public.visible_fics()
returns setof public.stories language sql stable security definer set search_path = public as $$
  select * from public.stories where kind = 'fanfic' and not is_hidden and source_url is not null
$$;
revoke execute on function public.visible_fics() from public, anon, authenticated;

-- "Add the AO3 link" on a fic without one: a reader who has it in their library (or an admin) sets the
-- link once. From then on it is an AO3 fic like any other. A link another story already has is refused
-- (23505, the unique index on source_url): that fic is already in Livami.
create or replace function public.set_fic_link(p_story uuid, p_link text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_link is null or p_link !~ '^https://archiveofourown\.org/works/[0-9]+$' then
    raise exception 'not an AO3 work link' using errcode = '22023';
  end if;
  if not public.is_active_user() then
    raise exception 'suspended readers cannot change stories' using errcode = '42501';
  end if;
  if not (public.is_admin() or exists (
    select 1 from public.library_entries le where le.story_id = p_story and le.user_id = auth.uid()
  )) then
    raise exception 'only a reader who has this fic can add its link' using errcode = '42501';
  end if;
  update public.stories set source_url = p_link, source = 'ao3', updated_at = now()
  where id = p_story and kind = 'fanfic' and source_url is null and not is_hidden;
  if not found then
    raise exception 'this fic already has a link' using errcode = '55000';
  end if;
end $$;
revoke execute on function public.set_fic_link(uuid, text) from public, anon;
grant execute on function public.set_fic_link(uuid, text) to authenticated;
